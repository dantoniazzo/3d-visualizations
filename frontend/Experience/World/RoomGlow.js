import * as THREE from "three";

import Experience from "../Experience.js";
import { FINISHES } from "../../../shared/catalog.js";
import { pointInPolygon } from "../../../shared/vegetation.js";
import { edgeDistance, openPairs } from "../../../shared/roomGraph.js";

/**
 * The rooms whose lights are on, glowing — in a view lit live (the editor,
 * its walkthrough, a version published without its light baked): the warm
 * light a room's lamps throw round it and bounce off its walls, on every
 * surface in it — so a lit room reads as lit from the next room, from the
 * garden and from the far end of the street, where no live light reaches
 * (World/LampPool.js lights only the few nearest). Room by room, as the
 * switches are (World/LiveSwitches.js); a room that is off is as it was.
 *
 * Without a material for each room — the house's are one per finish,
 * shared by every room, and merged — each surface finds its room itself, in
 * its shader: a map of the plan holds, for every few centimetres, which
 * rooms (up to four, one above another) are there; a table holds each
 * room's floor and ceiling heights and how lit it is. A surface looks a
 * little way out of its own face — into the room it faces, so a wall's
 * outside finds none — and glows with that room, its colour warmed. Turning
 * a switch changes one number in the table: nothing is built again.
 *
 * The same map keeps the short-reaching live lights that have no shadow of
 * their own (World/LampPool.js's unshadowed lights, the garden's) where they are: a
 * light in a room lights a surface only if the surface is in that room, or
 * in one open to it with no wall between (a hall and the living room it
 * runs into) — not the next room through the wall, the flat upstairs or the
 * terrace outside; a light out of doors lights only what is out of doors.
 */

/** The map's resolution, in metres. */
const TEXEL = 0.05;
/** How far a surface looks out of its face for its room, in metres. */
const REACH = 0.15;
/** How far each room is grown on the map, so a wall's face finds the room it faces. */
const GROW = 0.06;
/**
 * How far into its outside walls a room is taken to reach where no other
 * room does: a window's reveals, sill and glass are the room's, while the
 * wall's outside face, further out, is not.
 */
const FILL = 0.2;
/** Lamplight, a little under 3000 K. */
const WARM = new THREE.Color("#ffc58a");
/** How strongly a lit room glows, as a share of each surface's own colour: by day, and at night. */
const STRENGTH = { day: 0.16, night: 0.4 };
/** How long a room takes to light up or go dark, in seconds. */
const FADE = 0.25;
/**
 * The lights kept where they hang are those reaching no further than this,
 * in metres: a room's (LampPool's reach a room's size, a cabinet's
 * light), the garden's — not a car's headlamps, whose beam runs out
 * through a garage's doorway and down the drive.
 */
const KEPT_REACH = 12;

export default class RoomGlow {
    /**
     * @param {World} world  drawing a view lit live
     * @param {LiveSwitches} switches  its switches
     */
    constructor(world, switches) {
        this.experience = new Experience();
        this.scene = this.experience.scene;
        this.world = world;
        this.switches = switches;
        this.patched = new WeakSet();
        this.skipped = new WeakSet();
        /** Its own hooks: a copy of a material made to glow carries one already. */
        this.hooks = new WeakSet();
        this.build(world.sceneBuilder.spec);
        this.uniforms = {
            roomGlowMap: { value: this.map },
            roomGlowTable: { value: this.table },
            roomGlowArea: { value: this.area },
            roomGlowColour: { value: WARM.clone().multiplyScalar(STRENGTH.day) },
        };
        this.version = -1;
        this.applyTo(this.scene);
    }

    /** The map of the plan and the table of the rooms. */
    build(spec) {
        this.key = roomsKey(spec);
        const rooms = spec.rooms.filter((room) => room.ceiling_finish !== "none" && FINISHES[room.floor_finish]?.kind !== "ground");
        this.rooms = rooms;
        this.index = new Map(rooms.map((room, i) => [room.id, i]));
        let x0 = Infinity;
        let z0 = Infinity;
        let x1 = -Infinity;
        let z1 = -Infinity;
        for (const room of rooms) {
            for (const [x, z] of room.polygon) {
                x0 = Math.min(x0, x);
                z0 = Math.min(z0, z);
                x1 = Math.max(x1, x);
                z1 = Math.max(z1, z);
            }
        }
        if (!rooms.length) [x0, z0, x1, z1] = [0, 0, 1, 1];
        x0 -= FILL + TEXEL;
        z0 -= FILL + TEXEL;
        x1 += FILL + TEXEL;
        z1 += FILL + TEXEL;
        const width = Math.ceil((x1 - x0) / TEXEL);
        const height = Math.ceil((z1 - z0) / TEXEL);
        const data = new Uint8Array(width * height * 4);
        rooms.forEach((room, i) => {
            const id = i + 1;
            const xs = room.polygon.map((p) => p[0]);
            const zs = room.polygon.map((p) => p[1]);
            const c0 = Math.max(0, Math.floor((Math.min(...xs) - GROW - x0) / TEXEL));
            const c1 = Math.min(width - 1, Math.ceil((Math.max(...xs) + GROW - x0) / TEXEL));
            const r0 = Math.max(0, Math.floor((Math.min(...zs) - GROW - z0) / TEXEL));
            const r1 = Math.min(height - 1, Math.ceil((Math.max(...zs) + GROW - z0) / TEXEL));
            for (let r = r0; r <= r1; r++) {
                const z = z0 + (r + 0.5) * TEXEL;
                for (let c = c0; c <= c1; c++) {
                    const x = x0 + (c + 0.5) * TEXEL;
                    if (!pointInPolygon(x, z, room.polygon) && edgeDistance(x, z, room.polygon) > GROW) continue;
                    const at = (r * width + c) * 4;
                    for (let k = 0; k < 4; k++) {
                        if (data[at + k] === 0) {
                            data[at + k] = id;
                            break;
                        }
                    }
                }
            }
        });
        // Into the outside walls, where no room on the same storey is yet.
        const storeyOf = (a, b) => a.elevation < b.elevation + b.height + 0.05 && b.elevation < a.elevation + a.height + 0.05;
        rooms.forEach((room, i) => {
            const xs = room.polygon.map((p) => p[0]);
            const zs = room.polygon.map((p) => p[1]);
            const c0 = Math.max(0, Math.floor((Math.min(...xs) - FILL - x0) / TEXEL));
            const c1 = Math.min(width - 1, Math.ceil((Math.max(...xs) + FILL - x0) / TEXEL));
            const r0 = Math.max(0, Math.floor((Math.min(...zs) - FILL - z0) / TEXEL));
            const r1 = Math.min(height - 1, Math.ceil((Math.max(...zs) + FILL - z0) / TEXEL));
            for (let r = r0; r <= r1; r++) {
                const z = z0 + (r + 0.5) * TEXEL;
                for (let c = c0; c <= c1; c++) {
                    const at = (r * width + c) * 4;
                    let k = 0;
                    while (k < 4 && data[at + k] !== 0 && !storeyOf(rooms[data[at + k] - 1], room)) k++;
                    if (k === 4 || data[at + k] !== 0) continue;
                    if (edgeDistance(x0 + (c + 0.5) * TEXEL, z, room.polygon) <= FILL) data[at + k] = i + 1;
                }
            }
        });
        this.map = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
        this.map.magFilter = THREE.NearestFilter;
        this.map.minFilter = THREE.NearestFilter;
        this.map.generateMipmaps = false;
        this.map.needsUpdate = true;
        this.area = new THREE.Vector4(x0, z0, x1 - x0, z1 - z0);

        const cells = Math.max(1, rooms.length);
        this.values = new Float32Array(cells * 4);
        const groups = lightGroups(rooms, spec.walls || []);
        rooms.forEach((room, i) => {
            this.values[i * 4] = room.elevation - 0.05;
            this.values[i * 4 + 1] = room.elevation + room.height + 0.05;
            // Which rooms light each other: those open to one another with no wall between.
            this.values[i * 4 + 3] = groups[i];
        });
        this.table = new THREE.DataTexture(this.values, cells, 1, THREE.RGBAFormat, THREE.FloatType);
        this.table.magFilter = THREE.NearestFilter;
        this.table.minFilter = THREE.NearestFilter;
        this.table.generateMipmaps = false;
        this.table.needsUpdate = true;
        this.glow = new Float32Array(cells);
        this.target = new Float32Array(cells);
    }

    /** The rooms again, after the editor changed them — only if they did. */
    rebuild(spec) {
        if (roomsKey(spec) === this.key) return;
        this.map.dispose();
        this.table.dispose();
        // Each room as lit as it was, not dark and fading back.
        const before = new Map(this.rooms.map((room, i) => [room.id, this.glow[i]]));
        this.build(spec);
        this.rooms.forEach((room, i) => {
            const glow = before.get(room.id) ?? 0;
            this.glow[i] = glow;
            this.values[i * 4 + 2] = glow;
        });
        this.uniforms.roomGlowMap.value = this.map;
        this.uniforms.roomGlowTable.value = this.table;
        this.uniforms.roomGlowArea.value = this.area;
        this.version = -1;
    }

    /**
     * Every lit material in `root` made to glow with its room, once — those
     * added later (the furniture, an edit, the published view's copies) when
     * this is run again.
     */
    applyTo(root) {
        root.traverse((node) => {
            if (!node.isMesh && !node.isInstancedMesh) return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                if (!material || this.patched.has(material) || this.skipped.has(material)) continue;
                if (this.hooks.has(material.onBeforeCompile)) {
                    this.patched.add(material);
                    continue;
                }
                if (!(material.isMeshStandardMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial) || material.userData.noRoomGlow) {
                    this.skipped.add(material);
                    continue;
                }
                this.patch(material);
            }
        });
    }

    patch(material) {
        this.patched.add(material);
        const uniforms = this.uniforms;
        const previous = material.onBeforeCompile;
        const previousKey = material.customProgramCacheKey;
        const own = previous !== THREE.Material.prototype.onBeforeCompile ? previous : null;
        material.onBeforeCompile = function (shader, renderer) {
            own?.call(this, shader, renderer);
            patchShader(shader, uniforms);
        };
        this.hooks.add(material.onBeforeCompile);
        material.customProgramCacheKey = function () {
            const before = previousKey !== THREE.Material.prototype.customProgramCacheKey ? previousKey.call(this) : own ? own.toString() : "";
            return `${before}|room-glow`;
        };
        material.needsUpdate = true;
    }

    /** Whether every room has faded to how lit it is. */
    get settled() {
        return this.version === this.switches.version && this.glow.every((glow, i) => glow === this.target[i]);
    }

    update(delta) {
        // Each room as lit as the share of its light that is on: all of it
        // with its ceiling light (and the lamps on that switch), a little
        // with only a bedside lamp.
        if (this.switches.version !== this.version) {
            this.version = this.switches.version;
            const full = new Float32Array(this.target.length);
            this.target.fill(0);
            this.switches.entries.forEach((entry, index) => {
                const on = this.switches.weights[index] > 0;
                for (const fitting of entry.lights) {
                    const i = this.index.get(fitting.room);
                    if (i === undefined) continue;
                    full[i] += fitting.power;
                    if (on) this.target[i] += fitting.power;
                }
            });
            // A space open from one room into the next with no wall between —
            // a hall and the living room it runs into — glows as one.
            const on = new Map();
            const all = new Map();
            for (let i = 0; i < this.target.length; i++) {
                const group = this.values[i * 4 + 3];
                on.set(group, (on.get(group) ?? 0) + this.target[i]);
                all.set(group, (all.get(group) ?? 0) + full[i]);
            }
            for (let i = 0; i < this.target.length; i++) {
                const group = this.values[i * 4 + 3];
                this.target[i] = all.get(group) > 0 ? on.get(group) / all.get(group) : 0;
            }
        }
        const step = Math.min(1, delta / FADE);
        let changed = false;
        for (let i = 0; i < this.glow.length; i++) {
            const next = this.glow[i] + THREE.MathUtils.clamp(this.target[i] - this.glow[i], -step, step);
            if (next !== this.glow[i]) {
                this.glow[i] = next;
                this.values[i * 4 + 2] = next;
                changed = true;
            }
        }
        if (changed) this.table.needsUpdate = true;
        const strength = this.world.lighting === "night" ? STRENGTH.night : STRENGTH.day;
        this.uniforms.roomGlowColour.value.copy(WARM).multiplyScalar(strength);
    }

    dispose() {
        this.map.dispose();
        this.table.dispose();
    }
}

/** What the map is drawn from: the rooms' shapes, heights and kinds, and the walls between them. */
function roomsKey(spec) {
    return JSON.stringify([
        spec.rooms.map((room) => [room.id, room.polygon, room.elevation, room.height, room.ceiling_finish, room.floor_finish]),
        (spec.walls || []).map((wall) => [wall.start, wall.end, wall.thickness, wall.base_height, wall.height]),
    ]);
}

/**
 * The rooms that light one another, as groups (1, 2, …, one a room): those
 * open to one another with no wall between (shared/roomGraph.js openPairs).
 */
function lightGroups(rooms, walls) {
    const parent = rooms.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const index = new Map(rooms.map((room, i) => [room, i]));
    for (const [a, b] of openPairs(rooms, walls)) parent[find(index.get(a))] = find(index.get(b));
    return rooms.map((_, i) => find(i) + 1);
}

const VERTEX_AT = "#include <project_vertex>";
const FRAGMENT_AT = "#include <emissivemap_fragment>";
const LIGHTS_AT = "#include <lights_fragment_begin>";
const POINT_LIGHT_AT = "getPointLightInfo( pointLight, geometryPosition, directLight );";
const SPOT_LIGHT_AT = "getSpotLightInfo( spotLight, geometryPosition, directLight );";

/**
 * Where it is in the world, handed to the fragment; there, its room's glow
 * on top of its own: the room it faces, by the map and the table.
 */
function patchShader(shader, uniforms) {
    // Once only: a copy of a material made to glow keeps its predecessor's hook, and is given one of its own.
    if (shader.fragmentShader.includes("roomGlowAt(")) return;
    if (!shader.vertexShader.includes(VERTEX_AT) || !shader.fragmentShader.includes(FRAGMENT_AT)) return;
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vRoomGlowPosition;\nvarying vec3 vRoomGlowNormal;")
        .replace(
            VERTEX_AT,
            `${VERTEX_AT}
    {
        vec4 roomGlowWorld = vec4( transformed, 1.0 );
        vec3 roomGlowNormal = objectNormal;
        #ifdef USE_INSTANCING
            roomGlowWorld = instanceMatrix * roomGlowWorld;
            roomGlowNormal = mat3( instanceMatrix ) * roomGlowNormal;
        #endif
        vRoomGlowPosition = ( modelMatrix * roomGlowWorld ).xyz;
        vRoomGlowNormal = normalize( mat3( modelMatrix ) * roomGlowNormal );
    }`
        );
    shader.fragmentShader = shader.fragmentShader
        .replace(
            "#include <common>",
            `#include <common>
varying vec3 vRoomGlowPosition;
varying vec3 vRoomGlowNormal;
uniform sampler2D roomGlowMap;
uniform sampler2D roomGlowTable;
uniform vec4 roomGlowArea;
uniform vec3 roomGlowColour;
float roomGlowAt( vec3 point ) {
    vec2 uv = ( point.xz - roomGlowArea.xy ) / roomGlowArea.zw;
    if ( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) return 0.0;
    vec4 ids = texture2D( roomGlowMap, uv ) * 255.0;
    float glow = 0.0;
    for ( int k = 0; k < 4; k ++ ) {
        float id = ids[ k ];
        if ( id < 0.5 ) continue;
        vec4 room = texelFetch( roomGlowTable, ivec2( int( id + 0.5 ) - 1, 0 ), 0 );
        if ( point.y >= room.x && point.y <= room.y ) glow = max( glow, room.z );
    }
    return glow;
}
// The rooms the surface being drawn faces (up to four ids, 0 for none),
// where it looks for them, and whether it is in one at all.
vec4 roomGlowHere = vec4( 0.0 );
vec3 roomGlowHerePoint = vec3( 0.0 );
bool roomGlowHereIndoor = false;
// 1 where a light without a shadow reaches the surface: in the room it
// hangs in or one open to it, or, hanging out of doors, out of doors; 0
// through a wall.
float roomGlowReach( vec3 lightView ) {
    vec3 light = transpose( mat3( viewMatrix ) ) * ( lightView - viewMatrix[ 3 ].xyz );
    vec2 uv = ( light.xz - roomGlowArea.xy ) / roomGlowArea.zw;
    vec4 ids = vec4( 0.0 );
    if ( uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0 ) ids = texture2D( roomGlowMap, uv ) * 255.0;
    bool inRoom = false;
    for ( int k = 0; k < 4; k ++ ) {
        float id = ids[ k ];
        if ( id < 0.5 ) continue;
        vec4 room = texelFetch( roomGlowTable, ivec2( int( id + 0.5 ) - 1, 0 ), 0 );
        if ( light.y < room.x || light.y > room.y ) continue;
        inRoom = true;
        for ( int j = 0; j < 4; j ++ ) {
            float h = roomGlowHere[ j ];
            if ( h < 0.5 ) continue;
            vec4 here = texelFetch( roomGlowTable, ivec2( int( h + 0.5 ) - 1, 0 ), 0 );
            if ( abs( here.w - room.w ) < 0.5 && roomGlowHerePoint.y >= here.x && roomGlowHerePoint.y <= here.y ) return 1.0;
        }
    }
    if ( inRoom ) return 0.0;
    return roomGlowHereIndoor ? 0.0 : 1.0;
}`
        )
        .replace(
            FRAGMENT_AT,
            `${FRAGMENT_AT}
    {
        vec3 roomGlowFacing = normalize( vRoomGlowNormal ) * ( gl_FrontFacing ? 1.0 : -1.0 );
        roomGlowHerePoint = vRoomGlowPosition + roomGlowFacing * ${REACH.toFixed(2)};
        vec2 roomGlowUv = ( roomGlowHerePoint.xz - roomGlowArea.xy ) / roomGlowArea.zw;
        if ( roomGlowUv.x >= 0.0 && roomGlowUv.y >= 0.0 && roomGlowUv.x <= 1.0 && roomGlowUv.y <= 1.0 ) roomGlowHere = texture2D( roomGlowMap, roomGlowUv ) * 255.0;
        for ( int k = 0; k < 4; k ++ ) {
            if ( roomGlowHere[ k ] < 0.5 ) continue;
            vec4 room = texelFetch( roomGlowTable, ivec2( int( roomGlowHere[ k ] + 0.5 ) - 1, 0 ), 0 );
            if ( roomGlowHerePoint.y >= room.x && roomGlowHerePoint.y <= room.y ) roomGlowHereIndoor = true;
        }
        totalEmissiveRadiance += roomGlowColour * roomGlowAt( roomGlowHerePoint ) * diffuseColor.rgb;
    }`
        );
    // The lights without shadows kept where they are (no shadow stops them at
    // a wall): point lights, and spotlights after those with shadows (three
    // puts those first).
    const chunk = THREE.ShaderChunk.lights_fragment_begin;
    if (shader.fragmentShader.includes(LIGHTS_AT) && chunk.includes(POINT_LIGHT_AT) && chunk.includes(SPOT_LIGHT_AT)) {
        shader.fragmentShader = shader.fragmentShader.replace(
            LIGHTS_AT,
            chunk
                .replace(
                    POINT_LIGHT_AT,
                    `${POINT_LIGHT_AT}\n\t\tif ( directLight.visible && pointLight.distance > 0.0 && pointLight.distance <= ${KEPT_REACH.toFixed(1)} ) directLight.color *= roomGlowReach( pointLight.position );`
                )
                .replace(
                    SPOT_LIGHT_AT,
                    `${SPOT_LIGHT_AT}\n\t\t#if ( UNROLLED_LOOP_INDEX >= NUM_SPOT_LIGHT_SHADOWS )\n\t\tif ( directLight.visible && spotLight.distance > 0.0 && spotLight.distance <= ${KEPT_REACH.toFixed(1)} ) directLight.color *= roomGlowReach( spotLight.position );\n\t\t#endif`
                )
        );
    }
}

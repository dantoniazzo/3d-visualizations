import * as THREE from "three";

import LightResolver, { PACKED_16 } from "./LightResolver.js";
import { LIGHTMAP_DECODE, LIGHTMAP_YCOCG } from "./lightmapGLSL.js";
import { prepareLightmap } from "./SceneBuilder.js";
import { rewritten } from "./HouseMerger.js";
import { withoutGlow } from "./Sky.js";
import { chromaURL, lightmapURL } from "../Utils/device.js";
import { loadBakedTexture } from "../Utils/bakedTexture.js";

/**
 * The bake's light under the rooms of a public view drawn live
 * (World/LiveRoom.js, the K key) — the rooms with their true materials, the
 * sun and the lamps live with their shadows, and everything else of their
 * light as the bake traced it: the sky through the windows and every bounce
 * off the warm walls and floors, the soft shade in the corners and under
 * and behind the furniture, the lamps that are not drawn live — all of
 * the bake's light but what is drawn live. The user's words (2026-10-15):
 * "The baked light is more yellow and warmer and live light is more
 * white/blue, and also fewer shadows appear with the live light. Make the
 * live lights ambience look as similar as possible to the baked one." A
 * view lit live — the editor's realistic walkthrough, which the live room
 * drew as it is — lights a room by a share of the open sky, the same blue-
 * white in every corner, and a flat glow for a lit room's bounce; here
 * none of that is drawn, and the editor is as it was.
 *
 * What lights the rooms' surfaces, then, but the live sun and lamps:
 *
 *   - **The bake's light without what is drawn live** (its own lightmap,
 *     `resolver`: World/LightResolver.js drawing the house's light room by
 *     room, as the view's own resolved lightmap is drawn) — each room's
 *     part of the time of day's lightmap without the sun's straight light
 *     (the very lightmap the view draws from, its rooms each held their
 *     own way, less the sun's share of each texel by the sun's mask —
 *     LightResolver's `setSun` —, nothing taken out at a time of day with no
 *     sun; the bake's `<variant>-indirect` lightmap only where the mask has
 *     not come in MASK_WAIT), dimmed by the doors as they are; and each
 *     switch that is on, as far as it is: only what its lamps bounce (its
 *     `indirect` layer) while they are drawn live — with their shadows —
 *     and all of its light while they are not. three's standard materials
 *     add a lightmap to their light from round about as they are; the
 *     rooms' surfaces read this one through the lightmap's coordinates the
 *     merged house keeps, opened out as the view's own (decode).
 *   - **The thin faces' light** (`roomBake`, three numbers a vertex),
 *     added up as the view adds its own (SceneBuilder.mixThinLight): the
 *     time of day's less the sun's, and every switch that is on, all of
 *     its light — a thin face takes no live lamp, whose bounce the bake
 *     keeps only lit live (takeSwitchLight), so it has the bake's.
 *   - **What moves** — the people, the visitors, a door's leaf, a drawer,
 *     a car — the bake's light probes round it (World/ProbeLight.js:
 *     `cube`, each thing its own), added up the same way: the time of day's
 *     without the sun, each switch all of its light or what its lamps
 *     bounce. Clear glass — the rooms' panes, a shower's screen — takes
 *     none of it, as the bake lights none: its reflections alone
 *     (World/LiveRoom.js's plan, Utils/reflections.js's reflectionsOnly).
 *     A sheer curtain is none of these: the bake has no curtain, and it
 *     stays as the baked view draws it (World/LiveRoom.js's sheerCall).
 *     Every copy takes its material's own glow, not the one the scene's
 *     wears at night (Sky.js's withoutGlow).
 *
 * And none of the sky's light, the ambient or hemisphere light, or a room's
 * glow (World/RoomGlow.js is not made). Their reflections stay — the room
 * probe's, all of it (it is the room as drawn), or the sky's picture as far
 * as the surface's light is of what the sky would give it (`share`): a
 * glossy floor in a dark room does not shine with the dusk.
 *
 * The lamps drawn live are the bake's own (World/LampPool.js's `whole`):
 * where its lamps hung, as strong as its probes measured each (strengths),
 * shining every way, a switch's all
 * together, as many as the slider gives lights with shadows; every other
 * switch's light is the bake's, with its soft shadows. Their switch's
 * light comes and goes with them (`shares`: how much of a switch's light
 * its lamps give, faded as LampPool fades them; `weights`: how far a switch
 * is on, faded over FADE) — what one switch gives a room is its bounce
 * times how far it is on, and its straight light the live lamps' share of
 * it and the bake's for the rest.
 *
 * Used where the view's own light is resolved into one lightmap, and every
 * time of day with a sun has its light without it (usable): a bake without
 * those (an old one, a "static" one) draws its live rooms as before.
 */

/** How long a switch's light takes to come or go in the rooms drawn live, in seconds: as LampPool fades its lamps. */
const FADE = 0.25;
/**
 * How strong a lamp of the bake's is drawn live, over its watts over 4π (what a view lit live gives it, LampPool's
 * power), where the bake's probes do not say (strengths: each light as strong as they measured it). Its straight light
 * as the bake has it — a switch's layer less what its lamps bounce — over a point light's of those watts, worked out at
 * every pixel of the room seen (2026-10-15, Ladonia's bake 20261012T114849Z, unshadowed points, Lambert): 0.50 in A1's
 * bathroom and hall (one 40 W ceiling light each), 0.48 under the north first-floor living room's 320 W, 0.52–0.60 in
 * the two bedrooms, whose switches have a lamp besides, the colour the same to 5% (bluer by that); the sun, measured the
 * same way, 1.00 of its 3.2 W/m². The editor's lamps are as they were.
 */
const LAMP = 0.5;
/** measure: a light measured at a probe's way where it gives this much of what the switch's lights would, unshadowed, there... */
const ALONE = 0.92;
/** ...where that is at least this much (the probes' light, irradiance over π)... */
const MEASURED = 0.01;
/** ...on a way facing it at least this much (the cosine)... */
const FACING = 0.2;
/** ...not in a shade — its measure over this much of a point light's —... */
const UNSHADED = 0.1;
/** ...at this many ways, at least. */
const ENOUGH = 12;
/** How fast what moves takes on the probes' light where it now is, per second (ProbeLight's ADAPT). */
const ADAPT = 8;
/** How long, in milliseconds, the rooms wait for the sun's mask of the time of day before taking the bake's lightmap without the sun instead (ready). */
const MASK_WAIT = 3000;
/** Light's brightness, red, green and blue (GLSL). */
const LUMA = "vec3( 0.2126, 0.7152, 0.0722 )";
/** Where the lights' code begins and the maps' — three's chunks this changes. */
const BEGIN = "#include <lights_fragment_begin>";
const MAPS = "#include <lights_fragment_maps>";
const PLAIN_LIGHTMAP = "lightMapTexel.rgb * lightMapIntensity";
/** Where three's shadow functions are, and how its lights' code asks a point light's shadow. */
const SHADOWS = "#include <shadowmap_pars_fragment>";
const POINT_SHADOW =
    "getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar )";
/**
 * A lamp of the bake's drawn live (World/LampPool.js's `whole`, its shadow's
 * `radius` the lamp's own size in metres, negative) shades as softly as the
 * bake's lamp — a sphere that big — does: sharp where the shade is near what
 * casts it, softer the further off (percentage-closer soft shadows, as
 * Utils/softShadows.js does for the sun, over a point light's cube of maps).
 * With three's own filter (nine taps a texel or two apart) a bathroom's
 * stair box threw a hard-edged wedge across the wall where the bake has a
 * soft gradient, and a shower head a sharp disc on the tiles.
 *
 *   0. A first look: the way to the point and four ways round it at the
 *      edge of the search below — all clear, it is lit; all blocked, it is
 *      in the shade; either way nothing more is looked at (most of a room).
 *   1. Blockers: the depths in the cube round the way to the point, out to
 *      as wide as anything between the lamp and it could shade it from
 *      (but nearer the lamp than NEAREST, which is its fitting) — those
 *      nearer than the point, their mean.
 *   2. The penumbra's width, as seen from the lamp, from how far the point
 *      is behind them.
 *   3. The shade: that many taps over a disc that wide, turned by a
 *      per-pixel angle. Each tap is held to the receiver's own plane (where
 *      the way to that tap meets it), not to the point's own distance: over
 *      a disc this wide a wall seen at a slant would otherwise shade itself.
 *
 * Any other light's shadow (a radius not negative) is three's own.
 */
const SOFT_LAMP_GLSL = /* glsl */ `
#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	#define ROOM_BAKE_SEARCH 8
	#define ROOM_BAKE_TAPS 14
	// How near the lamp a blocker is looked for, in metres, and the widest penumbra, as seen from the lamp (radians).
	#define ROOM_BAKE_NEAREST 0.2
	#define ROOM_BAKE_WIDEST 0.2
	vec2 roomBakeDisc( int i, int n, float phi ) {
		float r = sqrt( ( float( i ) + 0.5 ) / float( n ) );
		float theta = float( i ) * 2.39996323 + phi;
		return r * vec2( cos( theta ), sin( theta ) );
	}
	// How far from the lamp the way \`d\` meets the receiver's plane (\`n\`, \`nd\`: its normal, and the point's distance along it), or \`at\` where it does not.
	float roomBakePlane( vec3 n, float nd, vec3 d, float at ) {
		float c = dot( n, d );
		float t = abs( c ) > 0.05 ? nd / c : -1.0;
		return t > 0.0 ? clamp( t, 0.5 * at, 2.0 * at ) : at;
	}
	// Whether the way \`d\` is blocked short of the receiver's plane: 1, or 0.
	float roomBakeBlocked( sampler2D shadowMap, float texelY, float near, float span, float slack, vec3 n, float nd, vec3 d, float at ) {
		float stored = near + unpackRGBAToDepth( texture2D( shadowMap, cubeToUV( d, texelY ) ) ) * span;
		return stored < roomBakePlane( n, nd, d, at ) - slack ? 1.0 : 0.0;
	}
	float roomBakePointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar, vec3 viewNormal ) {
		if ( shadowRadius >= 0.0 ) return getPointShadow( shadowMap, shadowMapSize, shadowBias, shadowRadius, shadowCoord, shadowCameraNear, shadowCameraFar );
		vec3 toPoint = shadowCoord.xyz;
		float receiver = length( toPoint );
		if ( receiver > shadowCameraFar || receiver < shadowCameraNear ) return 1.0;
		float size = - shadowRadius;
		float span = shadowCameraFar - shadowCameraNear;
		float slack = - shadowBias * span;
		float texelY = 1.0 / ( shadowMapSize.y * 2.0 );
		// (A texel of a side of the cube, as seen from the lamp.)
		float texel = 1.5707963 / shadowMapSize.y;
		vec3 w = toPoint / receiver;
		vec3 n = inverseTransformDirection( viewNormal, viewMatrix );
		float nd = dot( n, toPoint );
		// (Facing away from the lamp it takes next to none of its light — but by its relief —: its shadow as three has it, one tap.)
		if ( nd >= 0.0 ) return 1.0 - roomBakeBlocked( shadowMap, texelY, shadowCameraNear, span, slack, n, nd, w, receiver );
		vec3 t = normalize( cross( abs( w.y ) < 0.9 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 ), w ) );
		vec3 b = cross( w, t );
		float phi = 6.28318530 * fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
		float search = clamp( size * ( receiver - ROOM_BAKE_NEAREST ) / ( receiver * ROOM_BAKE_NEAREST ), 2.0 * texel, ROOM_BAKE_WIDEST );
		// A first look — the way to the point and four round it at the edge of the search —: all clear, it is lit, all
		// blocked, in the shade, without the rest (most of a room is one or the other).
		vec2 e = vec2( cos( phi ), sin( phi ) ) * search;
		float first = roomBakeBlocked( shadowMap, texelY, shadowCameraNear, span, slack, n, nd, w, receiver )
			+ roomBakeBlocked( shadowMap, texelY, shadowCameraNear, span, slack, n, nd, normalize( w + t * e.x + b * e.y ), receiver )
			+ roomBakeBlocked( shadowMap, texelY, shadowCameraNear, span, slack, n, nd, normalize( w - t * e.x - b * e.y ), receiver )
			+ roomBakeBlocked( shadowMap, texelY, shadowCameraNear, span, slack, n, nd, normalize( w - t * e.y + b * e.x ), receiver )
			+ roomBakeBlocked( shadowMap, texelY, shadowCameraNear, span, slack, n, nd, normalize( w + t * e.y - b * e.x ), receiver );
		if ( first == 0.0 ) return 1.0;
		if ( first == 5.0 ) return 0.0;
		float blockers = 0.0;
		float found = 0.0;
		for ( int k = 0; k < ROOM_BAKE_SEARCH; k ++ ) {
			vec2 o = roomBakeDisc( k, ROOM_BAKE_SEARCH, phi ) * search;
			vec3 d = normalize( w + t * o.x + b * o.y );
			float stored = shadowCameraNear + unpackRGBAToDepth( texture2D( shadowMap, cubeToUV( d, texelY ) ) ) * span;
			if ( stored < roomBakePlane( n, nd, d, receiver ) - slack ) {
				blockers += stored;
				found += 1.0;
			}
		}
		if ( found == 0.0 ) return 1.0;
		float blocker = max( blockers / found, shadowCameraNear );
		float penumbra = clamp( size * ( receiver - blocker ) / ( receiver * blocker ), texel, ROOM_BAKE_WIDEST );
		float lit = 0.0;
		for ( int k = 0; k < ROOM_BAKE_TAPS; k ++ ) {
			vec2 o = roomBakeDisc( k, ROOM_BAKE_TAPS, phi + 1.3 ) * penumbra;
			lit += 1.0 - roomBakeBlocked( shadowMap, texelY, shadowCameraNear, span, slack, n, nd, normalize( w + t * o.x + b * o.y ), receiver );
		}
		return lit / float( ROOM_BAKE_TAPS );
	}
#endif
`;
/** The materials three lights — whose light from round about this replaces (bakeShader). */
const LIT = ["isMeshStandardMaterial", "isMeshLambertMaterial", "isMeshPhongMaterial", "isMeshToonMaterial"];

const _at = new THREE.Vector3();
const _box = new THREE.Box3();
const _colour = new THREE.Color();

export default class RoomBakeLight {
    /**
     * Whether a view's bake can light its rooms drawn live: its light
     * resolved into one lightmap (SceneBuilder.resolver) over a merged house
     * whose surfaces keep their lightmap's coordinates, and every time of
     * day with a sun its light without it.
     */
    static usable(builder, lighting) {
        if (!builder?.resolver || !builder.merged || !lighting?.zones || !lighting.variants) return false;
        // (Its resolver binds the sun's mask besides the fifteen textures the view's own binds: LightResolver.usable.)
        if (!(builder.resolver.renderer.capabilities.maxTextures >= 16)) return false;
        return Object.values(lighting.variants).every((info) => info.storage === "ycocg" && info.chroma && (!(info.sun?.strength > 0) || Boolean(info.indirect?.lightmap && info.indirect.chroma)));
    }

    /** @param {LiveRoom} live */
    constructor(live) {
        this.live = live;
        this.world = live.world;
        this.builder = live.builder;
        this.lighting = live.published.lighting;
        this.entries = this.lighting.switches ?? [];
        const count = this.entries.length;
        /** How far each switch is on (0–1, faded) and how much of that its lamps give live (LampPool's levels): by the bake's index. */
        this.weights = new Float32Array(count);
        this.shares = new Float32Array(count);
        /** `${switch}|${zone}` -> what the switch's lamps bounce in the room: its `indirect` layer (loaded when first wanted, kept). */
        this.layers = new Map();
        this.loading = new Map();
        /** switch index -> its lights as the bake has them, for LampPool (lightsOf). */
        this.lights = new Map();
        /** variant -> its light without the sun's straight light, loading or loaded. */
        this.bases = new Map();
        /** The rooms whose part of the lightmap is drawn (track): those shown live and being made ready. */
        this.zones = new Set();
        /** What the rooms' surfaces read: the lightmap's colour (the resolver's), the materials that read it. */
        this.chroma = { value: null };
        this.mapped = new Set();
        /** `${material.id}|${kind}|${root}` -> the copy drawn so. */
        this.copies = new Map();
        /** A merged mesh -> its thin faces' light as the rooms drawn live take it (`roomBake`); each room's part's, as last added up. */
        this.thin = new Map();
        this.thinState = new WeakMap();
        /** root -> its six ways' light (`cube`), as its materials read it. */
        this.cubes = new Map();
        this.probeLight = null;
        this.probeKey = null;
        this.stats = { resolves: 0, thin: 0, cubes: 0 };
    }

    // ------------------------------------------------------------------
    // The lightmap
    // ------------------------------------------------------------------

    /** The resolver of the rooms' light, made once it is first wanted (given back by release). */
    resolverFor() {
        if (this.resolver) return this.resolver;
        const builder = this.builder;
        this.resolver = new LightResolver(builder.resolver.renderer, {
            zones: this.lighting.zones,
            doors: Math.max(0, ...[...builder.doorLayers.values()].map((layers) => layers.length)),
            layerCurves: builder.ownLayers(),
            sunless: true,
        });
        // (The rooms nearest the visitor first, as the view's own.)
        this.resolver.distance = builder.resolver.distance;
        return this.resolver;
    }

    /**
     * The time of day's light without the sun's straight light, loaded
     * once (and given back by release): its brightness and colour, as the
     * view's own lightmap is set up.
     */
    base(variant, info) {
        if (!this.bases.has(variant)) {
            const files = info.indirect;
            const promise = Promise.all([loadBakedTexture(lightmapURL(files)), loadBakedTexture(chromaURL(files))]).then(
                ([luma, chroma]) => {
                    // (Read texel for texel, as the resolver reads the view's own: no mipmaps.)
                    prepareLightmap(luma, THREE.RedFormat, false);
                    prepareLightmap(chroma, THREE.RGFormat, false);
                    return { luma, chroma };
                },
                (error) => {
                    this.bases.delete(variant);
                    console.warn("The bake's light without the sun did not load: the rooms drawn live keep the light they had", error);
                    return null;
                }
            );
            this.bases.set(variant, promise);
        }
        return this.bases.get(variant);
    }

    /**
     * Ready for the time of day the house is lit for: the resolver's base —
     * the light without the sun's, or, with no sun to take out, the view's
     * own (the same texture, its rooms each held their own way) — and the
     * doors' atlas. Before the rooms' shaders are built (LiveRoom.prepare):
     * they read the lightmap.
     *
     * @returns {Promise<boolean>} whether it is
     */
    async ready(variant) {
        const info = this.lighting.variants?.[variant];
        const main = this.builder.resolver;
        if (!info || !main?.base) return false;
        const layerEncoding = this.entries[0]?.encoding ?? null;
        const sunny = info.sun?.strength > 0;
        // With a sun: the view's own lightmap less the sun's share of it (its mask, once the view has it — it comes with
        // the time of day's light, but for a view's first), else the bake's lightmap without it.
        const shade = this.builder.sunShade;
        const masked = () => Boolean(shade && info.sun?.maskScale > 0 && shade.sunMaskScale.value === info.sun.maskScale && shade.sunMask.value?.userData?.size);
        for (let wait = 0; sunny && !masked() && wait < MASK_WAIT; wait += 100) await new Promise((resolve) => setTimeout(resolve, 100));
        let base = null;
        if (sunny && !masked()) {
            base = await this.base(variant, info);
            if (!base) return false;
        }
        // (Another time of day asked for meanwhile: its own call sets it.)
        if ((this.world.houseLighting ?? "day") !== variant || main.base === null) return false;
        const resolver = this.resolverFor();
        if (base) {
            const size = base.luma.userData.size?.[0] ?? main.size;
            const indirect = { encoding: info.encoding, scale: info.indirect.scale };
            resolver.setBase(base.luma, base.chroma, indirect, size, layerEncoding, this.builder.resolvedScale(indirect), null);
            resolver.setSun(null);
        } else {
            resolver.setBase(main.base.luma, main.base.chroma, { encoding: info.encoding, scale: main.base.scale }, main.size, layerEncoding, main.scale, main.base.rooms);
            resolver.setSun(sunny ? shade.sunMask.value : null, sunny ? info.sun.maskScale : 0, shade?.sunTint.value);
        }
        this.variant = variant;
        this.info = info;
        this.atlas();
        this.mapAll();
        // (Each kind of light's strength as the bake's probes measured it, for a light they do not measure alone —
        // kindStrength —: worked out here, before the rooms are shown, not in the frame that first lights one. Every
        // switch's probes read: Ladonia 13 ms, once a visit that presses K.)
        for (const kind of new Set(this.entries.flatMap((entry) => (entry?.lights ?? []).map((light) => light.kind)))) this.kindStrength(kind);
        return true;
    }

    /** The doors' atlas, once the view has it. */
    atlas() {
        const builder = this.builder;
        const texture = builder.doorAtlasReady ? builder.doorAtlas.value : null;
        if (!this.resolver || texture === this.atlasSet) return;
        this.atlasSet = texture;
        this.resolver.setDoorAtlas(texture);
    }

    /** The rooms drawn live from now on, and those being made ready: their part of the lightmap and their thin faces' light kept as they are. */
    track(zones) {
        for (const zone of zones) this.zones.add(zone);
    }

    /**
     * Each frame (LiveRoom.update), and at once (`delta` Infinity) when
     * rooms are first shown: each switch's light eased to how far it is on,
     * its lamps' share as the pool has lit them; each room tracked told to
     * the resolver as it now is; the thin faces' light added up where it
     * has changed; the probes' light for what moves.
     */
    update(delta) {
        const builder = this.builder;
        const target = builder.switchWeights || [];
        const step = Number.isFinite(delta) ? Math.min(1, delta / FADE) : 1;
        let moving = false;
        for (let i = 0; i < this.weights.length; i++) {
            const want = target[i] ?? 0;
            const now = this.weights[i];
            if (now !== want) {
                this.weights[i] = now + THREE.MathUtils.clamp(want - now, -step, step);
                moving = true;
            }
        }
        // How much of each switch's light its lamps give live: each lamp's level over its whole, by its share of the switch's power.
        this.sharesBefore ??= new Float32Array(this.shares.length);
        this.sharesBefore.set(this.shares);
        this.shares.fill(0);
        const pool = this.live.rig?.pool;
        if (pool?.lit) {
            for (const slot of pool.slots) {
                const fitting = slot.fitting;
                const whole = fitting ? pool.power(fitting) : 0;
                if (fitting?.index === undefined || !(whole > 0)) continue;
                this.shares[fitting.index] += Math.min(1, slot.level / whole) * fitting.share;
            }
            // (A lamp handed on fades out where it hung — no fitting any more, its level on its way down: its switch's straight
            // light comes back from the bake as it goes.)
            for (const slot of pool.slots) {
                const gone = slot.gone;
                if (slot.fitting || !gone || !(slot.level > 0)) continue;
                const whole = pool.power(gone);
                if (whole > 0) this.shares[gone.index] += Math.min(1, slot.level / whole) * gone.share;
            }
        }
        for (let i = 0; i < this.shares.length && !moving; i++) if (Math.abs(this.shares[i] - this.sharesBefore[i]) > 1e-4) moving = true;
        this.atlas();
        this.resolve();
        this.addThin();
        this.compose();
        // Whether the rooms' light is on its way somewhere — a switch fading, a lamp fading in or out where it is handed
        // on, the lightmap still to be drawn as it now is —: the light meter reads the frame again once it is not
        // (LiveRoom.update, Realism's LightMeter.lightKey). Read in the middle of a switch's fade, a room whose light
        // came on was exposed for its first glimmer: twice the bake's exposure until the camera moved.
        this.moving = moving || Boolean(this.resolver?.pending);
    }

    /** Each switch's light at once as it stands (the first frame rooms are shown): no fading in from the last. */
    snap() {
        const target = this.builder.switchWeights || [];
        for (let i = 0; i < this.weights.length; i++) this.weights[i] = target[i] ?? 0;
    }

    /** Each room tracked told to the resolver as it is now (it draws again only what has changed). */
    resolve() {
        const resolver = this.resolver;
        const builder = this.builder;
        if (!resolver?.base) return;
        for (const zone of this.zones) {
            if (!builder.resolvedZones.has(zone)) continue;
            const doors = [];
            if (builder.doorAtlasReady) {
                for (const { id, rect, at } of builder.doorLayers.get(zone) ?? []) doors.push({ rect, at, open: builder.doorLight.get(id).value });
            }
            const layers = [];
            for (const layer of builder.switchLayers.get(zone) ?? []) {
                const index = layer.index;
                const weight = this.weights[index];
                if (!(weight > 0)) continue;
                const reach = builder.switchReach(index, zone);
                const live = Math.min(this.shares[index], weight);
                // All of its light for as much of it as is not drawn live...
                const whole = builder.switchTextures.get(`${index}|${zone}`);
                if (whole && weight - live > 0) {
                    prepareLightmap(whole.luma, THREE.RedFormat, false);
                    prepareLightmap(whole.chroma, THREE.RGFormat, false);
                    layers.push({ luma: whole.luma, chroma: whole.chroma, rect: layer.rect, gain: (layer.curve ? 1 : layer.scale) * (weight - live) * reach, curve: layer.curve });
                }
                // ...and what its lamps bounce for the rest: their straight light is the live lamps'.
                const bounce = live > 0 ? this.layers.get(`${index}|${zone}`) : null;
                if (bounce) layers.push({ luma: bounce.luma, chroma: bounce.chroma, rect: layer.rect, gain: this.entries[index].indirect.scale * live * reach });
            }
            resolver.setZone(zone, doors, layers);
        }
    }

    /** Whatever of the lightmap has changed, drawn again (before a frame of the rooms: LiveRoom.draw, and at once as they are made ready). */
    flush(all = false) {
        if (!this.resolver?.base) return 0;
        const drawn = this.resolver.flush(all);
        if (drawn) this.stats.resolves++;
        return drawn;
    }

    // ------------------------------------------------------------------
    // The lamps drawn live: the bake's, a switch's all together
    // ------------------------------------------------------------------

    /**
     * A switch's lights as the bake lit them, for the pool to light live
     * (LampPool's `whole`): where each hung, its power, colour and size, and
     * its share of the switch's power — once what its lamps bounce is here
     * in every room it reaches (asked for the first time it is wanted); null
     * until then, or for a switch the bake has no bounce of.
     *
     * @param {object} entry  a switch of the rooms' own (LiveSwitches' `entries`)
     */
    lightsOf(entry) {
        const item = this.world.switches?.byId.get(entry.id);
        if (!item) return null;
        const index = item.index;
        const bake = this.entries[index];
        if (!bake?.indirect?.layers || !bake.lights?.length) return null;
        if (!this.bounceLoaded(index)) {
            this.loadBounce(index);
            return null;
        }
        if (!this.lights.has(index)) {
            const strengths = this.strengths(index, entry.room, bake.lights);
            const powers = bake.lights.map((light, k) => (light.power ?? 0) * strengths[k]);
            const total = powers.reduce((sum, power) => sum + power, 0) || 1;
            this.lights.set(
                index,
                bake.lights.map((light, k) => ({ ...light, watts: light.power, strength: strengths[k], power: powers[k], index, switch: entry.id, room: entry.room, share: powers[k] / total }))
            );
        }
        return this.lights.get(index);
    }

    /**
     * How strong each of a switch's lights is drawn live, over its watts over
     * 4π: as strong as the bake's light probes measured its straight light
     * (measure); a light they do not measure alone, as the bake's lights of
     * its kind are, the middle of them (kindStrength); LAMP where none is.
     *
     * @returns {number[]} one a light, in their order
     */
    strengths(index, room, lights) {
        return this.measure(index, room, lights).map((strength, k) => strength ?? this.kindStrength(lights[k].kind));
    }

    /**
     * Each of a switch's lights' straight light as the bake's probes have it,
     * over a point light's of its watts: at each probe of the switch's own
     * room, on each of the six ways it measures, the switch's light there
     * less what its lamps bounce, against what the switch's lights would give
     * there as points, unshadowed, Lambert — where one of them gives nearly
     * all of that (ALONE) and faces the way (FACING); the middle of the ways
     * it lights (not in a shade: over UNSHADED). Null for a light measured so at
     * fewer than ENOUGH ways. Ladonia's bake 20261012T114849Z: 79 of its
     * ceiling lights measured so 0.48–0.51 (a sphere 3 cm across hung 1.2 cm
     * under the ceiling: half of it in the ceiling, half its light, the same
     * from straight under it to level with it), 24 of its lamps 0.76–1.00,
     * the middle 1.00; Wrenfield's bake 20261001T143211Z: its pendants,
     * hanging free, 1.00, its three lamps 0.36–0.58. Drawn at 0.5 each
     * (LAMP), a bedside wall lamp left A1's bedroom 6.4 levels under the bake
     * at night, 18.7 in the third of the frame round it, and Wrenfield's
     * pendants its rooms 2–9 under.
     *
     * @returns {(number|null)[]}
     */
    measure(index, room, lights) {
        const probes = this.world.probes;
        const entry = probes?.switches?.[index];
        const indirect = entry ? probes.indirectOf(entry) : null;
        if (!entry || !indirect) return lights.map(() => null);
        const [nx, ny] = probes.size;
        const own = probes.zoneIds.indexOf(room);
        const glow = lights.map((light) => {
            const colour = _colour.set(light.color ?? "#ffffff");
            return ((light.power ?? 0) / (4 * Math.PI)) * (0.2126 * colour.r + 0.7152 * colour.g + 0.0722 * colour.b);
        });
        const ratios = lights.map(() => []);
        const reach = new Array(lights.length);
        const facing = new Array(lights.length);
        for (let j = 0; j < entry.indices.length; j++) {
            const at = entry.indices[j];
            if (own >= 0 && probes.zoneOf[at] !== own) continue;
            const x = probes.origin[0] + (at % nx) * probes.step[0];
            const y = probes.origin[1] + (Math.floor(at / nx) % ny) * probes.step[1];
            const z = probes.origin[2] + Math.floor(at / (nx * ny)) * probes.step[2];
            for (let face = 0; face < 6; face++) {
                const axis = face >> 1;
                const sign = face & 1 ? -1 : 1;
                let total = 0;
                for (let k = 0; k < lights.length; k++) {
                    const [lx, ly, lz] = lights[k].position;
                    const d = [lx - x, ly - y, lz - z];
                    const r2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
                    facing[k] = (sign * d[axis]) / Math.sqrt(r2);
                    reach[k] = facing[k] > 0 ? (glow[k] * facing[k]) / (Math.PI * r2) : 0;
                    total += reach[k];
                }
                if (!(total > MEASURED)) continue;
                const c = j * 18 + face * 3;
                const straight = 0.2126 * (entry.full[c] - indirect[c]) + 0.7152 * (entry.full[c + 1] - indirect[c + 1]) + 0.0722 * (entry.full[c + 2] - indirect[c + 2]);
                for (let k = 0; k < lights.length; k++) if (facing[k] > FACING && reach[k] >= ALONE * total) ratios[k].push(straight / total);
            }
        }
        return ratios.map((list) => {
            const lit = list.filter((ratio) => ratio > UNSHADED).sort((a, b) => a - b);
            return lit.length >= ENOUGH ? THREE.MathUtils.clamp(lit[lit.length >> 1], 0.05, 2) : null;
        });
    }

    /** The middle of what the probes measured of the bake's lights of a kind (measure), worked out the first time it is wanted; LAMP if none. */
    kindStrength(kind) {
        this.kinds ??= new Map();
        if (!this.kinds.has(kind)) {
            const measured = [];
            for (const item of this.world.switches?.list ?? []) {
                const lights = this.entries[item.index]?.lights ?? [];
                if (!lights.some((light) => light.kind === kind)) continue;
                this.measure(item.index, item.room, lights).forEach((strength, k) => {
                    if (strength !== null && lights[k].kind === kind) measured.push(strength);
                });
            }
            measured.sort((a, b) => a - b);
            this.kinds.set(kind, measured.length ? measured[measured.length >> 1] : LAMP);
        }
        return this.kinds.get(kind);
    }

    /** The rooms a switch's layers are drawn in (Switches' `zones`). */
    zonesOf(index) {
        return this.world.switches?.zones?.[index] ?? [];
    }

    bounceLoaded(index) {
        const layers = this.entries[index]?.indirect?.layers ?? {};
        return this.zonesOf(index).every((zone) => !layers[zone] || this.layers.has(`${index}|${zone}`));
    }

    /** What a switch's lamps bounce, in every room it reaches: loaded, and the pool asked to hand its lights round again. */
    loadBounce(index) {
        if (this.loading.has(index)) return this.loading.get(index);
        const layers = this.entries[index].indirect.layers;
        const promise = Promise.all(
            this.zonesOf(index)
                .filter((zone) => layers[zone])
                .map(async (zone) => {
                    const files = layers[zone];
                    const [luma, chroma] = await Promise.all([loadBakedTexture(lightmapURL(files)), loadBakedTexture(chromaURL(files))]);
                    prepareLightmap(luma, THREE.RedFormat, false);
                    prepareLightmap(chroma, THREE.RGFormat, false);
                    this.layers.set(`${index}|${zone}`, { luma, chroma });
                })
        ).then(
            () => {
                const pool = this.live.rig?.pool;
                if (pool) pool.key = null;
            },
            (error) => {
                this.loading.delete(index);
                console.warn(`What switch ${this.entries[index].id}'s lamps bounce did not load: its light stays the bake's`, error);
            }
        );
        this.loading.set(index, promise);
        return promise;
    }

    // ------------------------------------------------------------------
    // The rooms' surfaces and what moves: their materials
    // ------------------------------------------------------------------

    /**
     * How a part of a merged mesh of the house is lit here: "lightmap" —
     * it has the lightmap's coordinates —, "vertex" — a thin face, its
     * light in its vertices —, or "room": by the light of its room's
     * probes, every way (a fitting's glass, a metal's thin faces: kept a
     * mesh each, or whose bake drew no light of them).
     */
    kindOf(mesh, zone) {
        const lighting = mesh.userData.lighting;
        if (lighting === "lightmap" && mesh.geometry.attributes.uv1) return "lightmap";
        if (lighting === "vertex" && (this.builder.thinByZone?.get(zone) ?? []).some((part) => part.mesh === mesh)) return "vertex";
        return `room:${zone ?? "outside"}`;
    }

    /**
     * A material of the rooms drawn live, lit as `kind` says (kindOf; "cube"
     * for what moves — `root`, whose six ways' light it takes), made once:
     * a copy of `source`, which is as the rooms drawn live have it.
     */
    material(source, kind, root = null) {
        const key = `${source.id}|${kind}|${root?.id ?? ""}`;
        let copy = this.copies.get(key);
        if (copy) return copy;
        // (Its own glow, not the one the scene's material wears at night — Sky.js's withoutGlow: kept for the visit.)
        copy = withoutGlow(source.clone(), source);
        // (A shader of its own, which a copy does not take with it.)
        if (source.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) {
            copy.onBeforeCompile = source.onBeforeCompile;
            copy.customProgramCacheKey = source.customProgramCacheKey;
        }
        copy.userData.roomLive = true;
        this.copies.set(key, copy);
        // What takes no light at all — a car's lamps and their glass (shaders of their own that glow), what is drawn
        // unlit —: as it is. (Patched, each logged that three's shader had changed: seven at every showing of
        // Wrenfield's rooms, the car in its garage.)
        if (!LIT.some((flag) => copy[flag])) return copy;
        copy.userData.roomBake = kind;
        if (kind === "lightmap") {
            this.mapped.add(copy);
            this.map(copy);
        }
        // (A room's: its probes' light every way, as what moves in it takes the probes round it.)
        const room = kind.startsWith("room:") ? kind.slice(5) : null;
        this.patch(copy, room ? "cube" : kind, root ? this.cubeOf(root) : room ? this.cubeOf(`zone:${room}`) : null);
        return copy;
    }

    /** A material reading the lightmap given it as it is now: the resolver's brightness, its colour and scale. */
    map(material) {
        const resolver = this.resolver;
        if (!resolver?.luma) return;
        material.lightMap = resolver.luma;
        material.lightMapIntensity = Math.PI * resolver.scale;
        this.chroma.value = resolver.chroma;
    }

    mapAll() {
        for (const material of this.mapped) this.map(material);
    }

    /** The six ways' light a root's materials take, made once: as many numbers as the shader reads. */
    cubeOf(root) {
        let cube = this.cubes.get(root);
        if (!cube) {
            cube = { value: Array.from({ length: 6 }, () => new THREE.Vector3()), fresh: true };
            this.cubes.set(root, cube);
        }
        return cube;
    }

    /** A material's shader drawn in the bake's light (the class's comment): its light from round about the bake's alone. */
    patch(material, kind, cube) {
        const previous = material.onBeforeCompile;
        const previousKey = material.customProgramCacheKey;
        const own = previous !== THREE.Material.prototype.onBeforeCompile ? previous : null;
        const chroma = this.chroma;
        const encoding = this.info?.encoding ?? this.lighting.variants?.day?.encoding ?? "reinhard";
        const bake = this;
        material.onBeforeCompile = function (shader, renderer) {
            own?.call(this, shader, renderer);
            // Whether what it reflects is a room probe's (World/LiveRoom.js tags them), read as its uniforms are sent.
            const drawn = this;
            // (Its reflections all of them where they are the room probe's, or its own — a metal's studio, as the baked
            // view keeps them, but not into a face of a room probe (`capturing`): a dark bathroom's chrome and shower
            // screen, as bright as the studio by day, were all its walls reflected —; as far as its light goes where
            // they are the sky's, or the scene's.)
            shader.uniforms.roomBakeProbe = {
                get value() {
                    return drawn.envMap && (drawn.envMap.userData?.roomProbe || (!drawn.userData.skyMap && !bake.capturing)) ? 1 : 0;
                },
            };
            if (kind === "lightmap") shader.uniforms.lightMapChroma = chroma;
            if (cube) shader.uniforms.roomBakeCube = cube;
            bakeShader(shader, kind, encoding);
        };
        material.customProgramCacheKey = function () {
            const before = previousKey !== THREE.Material.prototype.customProgramCacheKey ? previousKey.call(this) : own ? own.toString() : "";
            return `${before}|room-bake:${kind}`;
        };
        material.needsUpdate = true;
    }

    // ------------------------------------------------------------------
    // The thin faces
    // ------------------------------------------------------------------

    /** A merged mesh's thin faces' light for the rooms drawn live (`roomBake`), made once: three numbers a vertex, none until added up (addThin). */
    thinOf(mesh) {
        let attribute = this.thin.get(mesh);
        if (!attribute) {
            attribute = rewritten(new THREE.BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count * 3), 3));
            attribute.name = "roomBake";
            this.thin.set(mesh, attribute);
        }
        return attribute;
    }

    /**
     * The thin faces' light of each room tracked, where it has changed (the
     * time of day, how much stays with the doors, each switch on and how far
     * it reaches): the time of day's less the sun's straight light — all of
     * it where it has none — dimmed as far as the doors are shut, and each
     * switch that is on, all of its light. Only the parts of the meshes
     * that are wanted (thinOf); only what changed sent to the GPU.
     */
    addThin() {
        const builder = this.builder;
        const info = this.info;
        if (!info || !builder.thinByZone) return;
        const name = info.attribute?.toLowerCase();
        const soft = info.sun?.strength > 0 ? info.indirect?.attribute?.toLowerCase() : null;
        const written = new Map();
        for (const zone of this.zones) {
            for (const part of builder.thinByZone.get(zone) ?? []) {
                const attribute = this.thin.get(part.mesh);
                if (!attribute) continue;
                const light = (soft && part.light[soft]) || part.light[name];
                if (!light) continue;
                const stays = builder.zoneStays(zone);
                let state = `${this.variant}|${light === part.light[name] ? name : soft}|${stays.toFixed(4)}`;
                const on = [];
                for (const entry of part.switchLight) {
                    if (entry.indirect) continue;
                    const weight = this.weights[entry.index];
                    if (!(weight > 0)) continue;
                    const gain = weight * builder.switchReach(entry.index, zone);
                    on.push(entry.values, gain);
                    state += `|${entry.index}:${gain.toFixed(4)}`;
                }
                if (this.thinState.get(part) === state) continue;
                this.thinState.set(part, state);
                const size = light.itemSize;
                const out = attribute.array;
                const from = light.array;
                const first = part.vertexStart;
                for (let v = 0; v < part.vertexCount; v++) {
                    const at = (first + v) * size;
                    const o = (first + v) * 3;
                    out[o] = from[at] * stays;
                    out[o + 1] = from[at + 1] * stays;
                    out[o + 2] = from[at + 2] * stays;
                }
                for (let k = 0; k < on.length; k += 2) {
                    const values = on[k];
                    const gain = on[k + 1];
                    for (let v = 0, o = first * 3; v < part.vertexCount; v++, o += 3) {
                        out[o] += values[v * 3] * gain;
                        out[o + 1] += values[v * 3 + 1] * gain;
                        out[o + 2] += values[v * 3 + 2] * gain;
                    }
                }
                if (!written.has(attribute)) written.set(attribute, []);
                written.get(attribute).push([first * 3, part.vertexCount * 3]);
                this.stats.thin++;
            }
        }
        for (const [attribute, ranges] of written) {
            for (const [start, count] of ranges) attribute.addUpdateRange(start, count);
            if (attribute.updateRanges.length > 32) {
                const first = Math.min(...attribute.updateRanges.map((range) => range.start));
                const last = Math.max(...attribute.updateRanges.map((range) => range.start + range.count));
                attribute.clearUpdateRanges();
                attribute.addUpdateRange(first, last - first);
            }
            attribute.needsUpdate = true;
        }
    }

    // ------------------------------------------------------------------
    // What moves: the probes' light
    // ------------------------------------------------------------------

    /** The probes' light as the rooms drawn live have it (ProbeLight.composeShared), added up again only when it changes. */
    compose() {
        const probes = this.world.probes;
        if (!probes) return;
        const round = (values) => Array.from(values, (value) => Math.round(value * 1000)).join(",");
        const key = `${this.world.houseLighting}|${this.builder.doorLightVersion ?? 0}|${round(this.weights)}|${round(this.shares)}`;
        if (key === this.probeKey && this.probeLight) return;
        this.probeLight ??= new Float32Array(probes.light.length);
        if (probes.composeShared(this.probeLight, this.weights, this.shares)) this.probeKey = key;
    }

    /**
     * Each root's six ways' light (cubeOf) from the probes round it, eased
     * to as it moves as ProbeLight eases what it lights — at once the first
     * time. A pane by the middle of its box, which is where its glass is.
     *
     * @param {Iterable<THREE.Object3D>} roots
     */
    light(roots, delta) {
        const probes = this.world.probes;
        if (!probes || !this.probeLight) return;
        const k = Math.min(1, ADAPT * (Number.isFinite(delta) ? delta : 1));
        this.zoneCubes(probes);
        for (const root of roots) {
            const cube = this.cubes.get(root);
            if (!cube) continue;
            let at = null;
            if (root.isMesh && root.geometry && !root.isSkinnedMesh && probes.liftOf(root) === 0 && !probes.leaves?.has(root)) {
                if (!root.geometry.boundingBox) root.geometry.computeBoundingBox();
                at = _box.copy(root.geometry.boundingBox).applyMatrix4(root.matrixWorld).getCenter(_at);
            }
            const light = probes.lightAt(root, probes.liftOf(root), this.probeLight, at);
            if (!light) continue;
            const step = cube.fresh ? 1 : k;
            cube.fresh = false;
            for (let f = 0; f < 6; f++) {
                const c = cube.value[f];
                c.x += (light[f * 3] - c.x) * step;
                c.y += (light[f * 3 + 1] - c.y) * step;
                c.z += (light[f * 3 + 2] - c.z) * step;
            }
            this.stats.cubes++;
        }
    }

    /**
     * Each room's own light every way (`zone:<id>` cubes, kindOf's "room"):
     * the mean of its probes' as the rooms drawn live have them, when that
     * has changed.
     */
    zoneCubes(probes) {
        if (this.zonesFor === this.probeKey) return;
        this.zonesFor = this.probeKey;
        const wanted = new Map();
        for (const [key, cube] of this.cubes) if (typeof key === "string") wanted.set(probes.zoneIds.indexOf(key.slice(5)), { cube, sum: new Float64Array(18), count: 0 });
        if (!wanted.size) return;
        const light = this.probeLight;
        for (let index = 0; index < probes.count; index++) {
            const entry = wanted.get(probes.zoneOf[index]);
            if (!entry) continue;
            for (let i = 0; i < 18; i++) entry.sum[i] += light[index * 18 + i];
            entry.count++;
        }
        for (const { cube, sum, count } of wanted.values()) {
            if (!count) continue;
            for (let f = 0; f < 6; f++) cube.value[f].set(sum[f * 3] / count, sum[f * 3 + 1] / count, sum[f * 3 + 2] / count);
        }
    }

    // ------------------------------------------------------------------

    /** Given back with the rest of the rooms drawn live (LiveRoom.release): the lightmap's targets, the light without the sun; what is kept is small. */
    release() {
        this.resolver?.dispose();
        this.resolver = null;
        this.atlasSet = undefined;
        for (const promise of this.bases.values()) {
            promise.then((base) => {
                base?.luma.dispose();
                base?.chroma.dispose();
            });
        }
        this.bases.clear();
        this.variant = null;
        this.zones.clear();
        for (const attribute of this.thin.values()) attribute.array.fill(0);
        this.thinState = new WeakMap();
        this.probeKey = null;
        this.zonesFor = null;
        for (const cube of this.cubes.values()) cube.fresh = true;
    }

    dispose() {
        this.release();
        for (const { luma, chroma } of this.layers.values()) {
            luma.dispose();
            chroma.dispose();
        }
        this.layers.clear();
        this.loading.clear();
        for (const copy of this.copies.values()) copy.dispose();
        this.copies.clear();
    }
}

/**
 * A lit material's shader drawn in the bake's light (RoomBakeLight): none of
 * the ambient, hemisphere or probe light three would give it, nor the sky's
 * from its map (`iblIrradiance`) — its light from round about the bake's:
 * its lightmap, opened out as the resolved lightmap is ("lightmap"), its
 * vertices' ("vertex": and no live lamp's), or the probes' six ways round
 * it ("cube"). Its reflections the room probe's whole, or the sky's as far
 * as its light is of what the sky would give it.
 */
function bakeShader(shader, kind, encoding) {
    const begin = THREE.ShaderChunk.lights_fragment_begin;
    const without = [
        ["vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );", "vec3 irradiance = vec3( 0.0 );"],
        ["irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );", ""],
        ["irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );", ""],
        // A lamp of the bake's shades as softly as it is big (SOFT_LAMP_GLSL).
        [POINT_SHADOW, `roomBakePointShadow${POINT_SHADOW.slice("getPointShadow".length, -2)}, nonPerturbedNormal )`],
        // A thin face's light has the lamps' in it already (RoomBakeLight.addThin): none of the live ones'.
        ...(kind === "vertex"
            ? [["getPointLightInfo( pointLight, geometryPosition, directLight );", "getPointLightInfo( pointLight, geometryPosition, directLight );\n\t\tdirectLight.visible = false;\n\t\tdirectLight.color = vec3( 0.0 );"]]
            : []),
    ];
    if (!shader.fragmentShader.includes(BEGIN) || !shader.fragmentShader.includes(MAPS) || !shader.fragmentShader.includes(SHADOWS) || without.some(([line]) => !begin.includes(line))) {
        console.warn("A room drawn live not lit by its bake: three's shader has changed");
        return;
    }
    const lights = without.reduce((code, [line, instead]) => code.replace(line, instead), begin);
    // (After three's shadow functions, which the soft lamp's calls.)
    shader.fragmentShader = shader.fragmentShader.replace(SHADOWS, `${SHADOWS}\n${SOFT_LAMP_GLSL}`);
    let prefix = "uniform float roomBakeProbe;\n";
    let add = "";
    if (kind === "lightmap") {
        prefix += `${LIGHTMAP_YCOCG}
uniform sampler2D lightMapChroma;
${PACKED_16}
vec3 roomBakeLightmap( vec2 luma, vec2 uv ) {
	vec4 c = texture2D( lightMapChroma, uv );
	return ycocgColour( unpack16( luma ), vec2( unpack16( c.rg ), unpack16( c.ba ) ) );
}
`;
    } else if (kind === "vertex") {
        prefix += "varying vec3 vRoomBake;\n";
        add = "irradiance += vRoomBake * PI;";
        shader.vertexShader = `attribute vec3 roomBake;\nvarying vec3 vRoomBake;\n${shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvRoomBake = roomBake;")}`;
    } else if (kind === "cube") {
        prefix += `uniform vec3 roomBakeCube[ 6 ];
vec3 roomBakeAround( const in vec3 normal ) {
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec3 s = n * n;
	return PI * (
		s.x * ( n.x >= 0.0 ? roomBakeCube[ 0 ] : roomBakeCube[ 1 ] ) +
		s.y * ( n.y >= 0.0 ? roomBakeCube[ 2 ] : roomBakeCube[ 3 ] ) +
		s.z * ( n.z >= 0.0 ? roomBakeCube[ 4 ] : roomBakeCube[ 5 ] ) );
}
`;
        add = "irradiance += roomBakeAround( geometryNormal );";
    }
    // (The maps' chunk written out, for the lightmap's light to be found in it.)
    const after = `${THREE.ShaderChunk.lights_fragment_maps}
#if defined( RE_IndirectDiffuse )
	{
		${add}
		#if defined( RE_IndirectSpecular )
			if ( roomBakeProbe < 0.5 ) {
				float roomBakeSky = dot( iblIrradiance, ${LUMA} );
				float roomBakeShare = roomBakeSky > 1e-6 ? clamp( dot( irradiance, ${LUMA} ) / roomBakeSky, 0.0, 1.0 ) : 0.0;
				radiance *= roomBakeShare;
				clearcoatRadiance *= roomBakeShare;
			}
		#endif
		iblIrradiance = vec3( 0.0 );
	}
#endif`;
    let fragment = shader.fragmentShader.replace(BEGIN, lights).replace(MAPS, after);
    if (kind === "lightmap") {
        if (!fragment.includes(PLAIN_LIGHTMAP)) console.warn("A room drawn live: its lightmap not opened out — three's shader has changed");
        const decode = LIGHTMAP_DECODE[encoding] ?? ((e) => e);
        fragment = fragment.replace(PLAIN_LIGHTMAP, `${decode("roomBakeLightmap( lightMapTexel.rg, vLightMapUv )")} * lightMapIntensity`);
    }
    shader.fragmentShader = fragment.replace("#include <common>", `#include <common>\n${prefix}`);
}

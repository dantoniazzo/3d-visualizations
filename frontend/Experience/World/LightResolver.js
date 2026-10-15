import * as THREE from "three";

import { lightRegions } from "../../../shared/lightRegions.js";
import { LIGHTMAP_DECODE, LIGHTMAP_YCOCG } from "./lightmapGLSL.js";

/**
 * The house's baked light as it is now, in ONE lightmap: the day's or the
 * night's, each room's dimmed as far as its doors are shut, plus every
 * light switch that is on — drawn here, on the GPU, into a pair of render
 * targets the size of the lightmap in use, and drawn again only when
 * something changes (a variant loaded, a switch turned, a layer arriving, a
 * door moving, the doors' atlas arriving) and only over the rooms that
 * changed. Every lightmapped material of the house then reads this one map
 * with one small shader, the same for every room (SceneBuilder's
 * decodeLightmap, `resolved`): no room draws with materials of its own,
 * and a room may take any number of switches.
 *
 * What it holds, texel by texel, is what a room's material used to work
 * out fragment by fragment:
 *
 *     base × stays + Σ switch × gain
 *
 * `base` the variant's lightmap; `stays` how much of it each of the room's
 * doors leaves as far as it is shut (the doors' atlas); each switch's
 * layer over the room's crop of the atlas, times its gain. What is left to
 * the fragment is what changes with the view: a floor's light brought up
 * from above, and — where what moves shades the sun ("baked") — the sun's
 * straight light, which no door dims: given back as far as the doors took
 * it, and taken away as far as it is shaded, read from the sun's mask as a
 * room's own material read it. For that the fragment needs `stays` itself,
 * kept beside the lightmap in a third, small target (`stays`: a byte a
 * texel at the colour's size, which is the doors' atlas's; SceneBuilder's
 * RESOLVED_LIGHT). The sun's light is not kept undimmed in the map
 * itself, for the fragment only to take away where it is shaded: what it
 * takes away is read from the mask at the view's level of detail, what
 * the map holds was added texel by texel, and seen from a few metres the
 * two no longer cancel — a strip of sun stayed at the foot of a shut door.
 *
 * It is kept AS THE VARIANT'S LIGHTMAP IS ENCODED — squeezed (reinhard),
 * sRGB, its brightness at full size and its colour at half — not as linear
 * light: a lightmap is drawn by blending its texels as they are stored and
 * opening the result out, and the edge of a patch of sun, blended as
 * linear light, comes out up to twice as bright half a texel in. Kept as
 * stored, a texel no switch lights and no door dims is the variant's own,
 * to the bit, and is blended as it always was. Each value has 16 bits, in
 * two 8-bit channels (high and low byte: blending is linear, so the two
 * blend apart and are put together after): a dark room has only 14–20 of
 * the lightmap's 255 levels and is then exposed ×4 to ×32, so its light,
 * dimmed by a door, must not be rounded to those levels again — and
 * 8-bit targets are drawn to and blended by every WebGL 2 device, where
 * half-float ones need an extension. Brightness RG8 at the lightmap's
 * size, colour RGBA8 at half: 3 bytes a texel, 64 MB with mipmaps for a
 * 4096² lightmap and 16 MB for a phone's 2048² (a single RGBA half-float
 * target would be 171 and 43); `stays`, where it is kept, 4 MB and 1.
 *
 * Each room's part of it is the room's rectangle of the atlas and what its
 * faces blend in from beside it, as far as halfway to the next room
 * (`regions`).
 *
 * A bake may hold each room's part of the variant's lightmap ITS OWN WAY
 * (blender/lib/lightzones.py: `rooms`, setBase): the room's light by its
 * logarithm between next to nothing and its own brightest texel, its
 * colour stretched — two to three per cent of the light a level, where
 * the one scale leaves a dim room steps of seven to nine and the WebP's
 * blocks show. Such a room's part is opened out by its own curve here
 * (`uBaseCurve`) and kept as everything else is; nothing else reads those
 * texels. It is drawn with every room's part, whatever its switches and
 * doors — so every such room is one of `zones` — and, should its switches'
 * layers have to wait their turn (UPLOADS), without them meanwhile: read
 * as the one-scale lightmap its texels would be many times too bright.
 * What is outside every such room's part (the garden: its zone has no
 * curve) is the one-scale lightmap's own texel, as ever.
 *
 * Its scale (what its 1 stands for, `scale`) is the variant's own, but for
 * a variant far darker than its lamps — a night — where it is the
 * switches' (SceneBuilder.resolvedScale says why): the variant's texels
 * are then opened out and encoded again, as the rest is.
 *
 * Mipmaps are the GPU's (generateMipmap), made again after each change —
 * while a door swings, ten times a second at most (`swinging`). Between
 * texels and in the mipmaps the blend is of the SUM as encoded, where each
 * room's material blended the lightmap, each layer and the doors' atlas
 * apart and added up after: the same at every texel's centre, a little
 * different between two texels where a door dims a room or a lamp lights
 * it and the light changes sharply — most where a patch of sun is seen at
 * a slant in a room whose doors are shut: it is dimmed before it is
 * blended.
 */

/** How many switch layers one pass adds: two textures each, beside the base's two and the doors' atlas — fifteen of the sixteen a WebGL 2 device binds at least. A room with more is drawn in turns. */
const LAYERS = 6;
/** What each target holds, as the shader's `uKind`. */
const KIND = { luma: 0, chroma: 1, stays: 2 };
/** While a door swings, the mipmaps are made again this often (s). */
const MIP_EVERY = 0.1;
/** How many textures the GPU has not had yet one frame's drawing may bring in: a first night's few hundred layers come in over a few frames, the rooms nearest first. */
const UPLOADS = 64;

/** A curve a room's part, or a layer, is tried with (usable): its knee, its top, how far its colour is stretched. */
const CURVE = [0.01, 1, 4];

/** Two bytes of a texel put together, and a value split into them (GLSL). */
export const PACKED_16 = /* glsl */ `
float unpack16( vec2 bytes ) {
	return dot( bytes, vec2( 65280.0, 255.0 ) / 65535.0 );
}
`;

const VERTEX = /* glsl */ `
uniform vec4 uQuad;
void main() {
	gl_Position = vec4( mix( uQuad.xy, uQuad.zw, position.xy * 0.5 + 0.5 ), 0.0, 1.0 );
}
`;

/** The inverse of a lightmap's decoding (lightmapGLSL.js), for `x`, the light in the lightmap's own scale. */
const ENCODE = {
    // x / (1 + x) up to 64 times the scale, where the decoding stops dividing (its 1 / 65).
    reinhard: (x) => `mix( ${x} / ( 1.0 + ${x} ), ${x} / 65.0, step( vec3( 64.0 ), ${x} ) )`,
};

function fragment(encoding, layerEncoding, doors, coded = false, layerCoded = false, sunless = false) {
    const decode = LIGHTMAP_DECODE[encoding] ?? ((e) => e);
    const decodeLayer = LIGHTMAP_DECODE[layerEncoding] ?? ((e) => e);
    const encode = (LIGHTMAP_DECODE[encoding] && ENCODE[encoding]) || ((x) => x);
    const layers = Array.from({ length: LAYERS }, (_, k) => k);
    // A switch's layer in a room: as the switch's layers are encoded — or, where the bake holds some rooms' layers
    // their own way (blender/bake_public.py's encode_own: a room the light only spills into), by that layer's own
    // curve, as a room's part of the variant's lightmap is opened out below.
    const layerLight = layerCoded
        ? /* glsl */ `
uniform vec3 uLayerCurve[ ${LAYERS} ];
vec3 layerLight( sampler2D luma, sampler2D chroma, vec4 rect, vec3 curve, vec2 uv, vec2 colourUv ) {
	float y = textureLod( luma, ( uv - rect.xy ) / rect.zw, 0.0 ).r;
	vec2 c = textureLod( chroma, ( colourUv - rect.xy ) / rect.zw, 0.0 ).rg;
	if ( curve.y > 0.0 ) {
		// curve.x its knee, .y log2( 1 + top / knee ), .z how far its colour's differences are stretched.
		vec2 d = ( c - 128.0 / 255.0 ) / curve.z;
		float t = y - d.y;
		return curve.x * ( exp2( clamp( vec3( t + d.x, y + d.y, t - d.x ), 0.0, 1.0 ) * curve.y ) - 1.0 );
	}
	vec3 e = ycocgColour( y, c );
	return ${decodeLayer("e")};
}`
        : /* glsl */ `
vec3 layerLight( sampler2D luma, sampler2D chroma, vec4 rect, vec2 uv, vec2 colourUv ) {
	vec3 e = ycocgColour( textureLod( luma, ( uv - rect.xy ) / rect.zw, 0.0 ).r, textureLod( chroma, ( colourUv - rect.xy ) / rect.zw, 0.0 ).rg );
	return ${decodeLayer("e")};
}`;
    const curveOf = (k) => (layerCoded ? `uLayerCurve[ ${k} ], ` : "");
    return /* glsl */ `
uniform vec2 uSize;
uniform vec2 uOrigin;
uniform float uKind;
uniform float uPlain;
uniform sampler2D uBaseLuma;
uniform sampler2D uBaseChroma;
uniform float uBaseScale;
${coded ? "uniform vec3 uBaseCurve;" : ""}
uniform float uPartial;
uniform vec2 uPartialOrigin;
uniform vec2 uPartialSize;
uniform sampler2D uDoorAtlas;${
        sunless
            ? `
uniform sampler2D uSunMask;
uniform float uSunScale;
uniform vec3 uSunTint;`
            : ""
    }
uniform vec4 uDoorRect[ ${doors} ];
uniform vec4 uDoorAt[ ${doors} ];
uniform float uDoorOpen[ ${doors} ];
${layers.map((k) => `uniform sampler2D uLayerLuma${k};\nuniform sampler2D uLayerChroma${k};`).join("\n")}
uniform vec4 uLayerRect[ ${LAYERS} ];
uniform float uLayerGain[ ${LAYERS} ];
${LIGHTMAP_YCOCG}
${PACKED_16}
vec2 pack16( float value ) {
	float n = floor( clamp( value, 0.0, 1.0 ) * 65535.0 + 0.5 );
	float high = floor( n / 256.0 );
	return vec2( high, n - high * 256.0 ) / 255.0;
}
${layerLight.trim()}
// How much of the room's light stays with its doors as they are, at uv: each door's crop of the doors' atlas, as far
// as the door is shut. (Beside the room's own rectangle, what the crop has at its edge: not the next crop's.)
float staysAt( vec2 uv ) {
	float stays = 1.0;
	for ( int k = 0; k < ${doors}; k ++ ) {
		if ( uDoorOpen[ k ] > 0.999 ) continue;
		vec2 at = uDoorAt[ k ].xy + clamp( ( uv - uDoorRect[ k ].xy ) / uDoorRect[ k ].zw, 0.0, 1.0 ) * uDoorAt[ k ].zw;
		stays *= mix( textureLod( uDoorAtlas, at, 0.0 ).r, 1.0, uDoorOpen[ k ] );
	}
	return stays;
}
// One texel of the lightmap as it is kept (encoded): cell, its centre, in the lightmap's texels, of which there
// are size; colourAt, where its colour is read, in the colour's texels — blended there, as a lightmap's is drawn.
vec3 encodedAt( vec2 cell, vec2 colourAt, vec2 size, vec2 partialOrigin ) {
	vec2 uv = cell / size;
	vec2 colourUv = colourAt * 2.0 / size;
	float luma;
	vec2 chroma;
	if ( uPartial > 0.5 ) {
		// What an earlier turn of this room added up (a scratch pair, the room at its corner), as this writes it.
		luma = unpack16( texelFetch( uBaseLuma, ivec2( cell - partialOrigin ), 0 ).rg );
		vec2 at = clamp( colourAt - partialOrigin * 0.5, vec2( 0.5 ), uPartialSize - 0.5 ) / vec2( textureSize( uBaseChroma, 0 ) );
		vec4 c = textureLod( uBaseChroma, at, 0.0 );
		chroma = vec2( unpack16( c.rg ), unpack16( c.ba ) );
	} else {
		luma = textureLod( uBaseLuma, uv, 0.0 ).r;
		chroma = textureLod( uBaseChroma, colourUv, 0.0 ).rg;
	}
	vec3 e = ycocgColour( luma, chroma );
	vec3 light = ${decode("e")};
${
    sunless
        ? `	// Less the sun's straight light (sunless): the variant's light opened out — by its room's curve where it was held
	// so —, the sun's share of it taken away (its mask, as the view's own materials read it: SceneBuilder's sunPart),
	// and as much of the rest as the doors leave.
	if ( uPartial < 0.5 ) {
${coded ? `		if ( uBaseCurve.y > 0.0 ) {
			vec2 c = ( chroma - 128.0 / 255.0 ) / uBaseCurve.z;
			float t = luma - c.y;
			light = uBaseCurve.x * ( exp2( clamp( vec3( t + c.x, luma + c.y, t - c.x ), 0.0, 1.0 ) * uBaseCurve.y ) - 1.0 );
		} else ` : "		"}light *= uBaseScale;
		float m = textureLod( uSunMask, uv, 0.0 ).r;
		float l = m <= 0.04045 ? m / 12.92 : pow( ( m + 0.055 ) / 1.055, 2.4 );
		light = max( light - uSunTint * ( l / max( 1.0 - l, 1.0 / 65.0 ) ) * uSunScale, vec3( 0.0 ) ) * staysAt( uv );
	}
`
        : `${
    coded
        ? `	// A room held its own way (blender/lib/lightzones.py's curve): its stored light — the colour's differences
	// stretched by uBaseCurve.z — is ln( 1 + light / knee ) over ln( 1 + top / knee ); uBaseCurve.x the knee in
	// the scale this is kept in, .y log2( 1 + top / knee ).
	if ( uPartial < 0.5 && uBaseCurve.y > 0.0 ) {
		vec2 c = ( chroma - 128.0 / 255.0 ) / uBaseCurve.z;
		float t = luma - c.y;
		vec3 stored = clamp( vec3( t + c.x, luma + c.y, t - c.x ), 0.0, 1.0 );
		light = uBaseCurve.x * ( exp2( stored * uBaseCurve.y ) - 1.0 ) * staysAt( uv );
	} else
`
        : ""
}	// From the variant's own scale to the one this is kept in, and as much of it as the room's doors leave.
	if ( uPartial < 0.5 ) light *= uBaseScale * staysAt( uv );
`
}${layers.map((k) => `\tif ( uLayerGain[ ${k} ] > 0.0 ) light += layerLight( uLayerLuma${k}, uLayerChroma${k}, uLayerRect[ ${k} ], ${curveOf(k)}uv, colourUv ) * uLayerGain[ ${k} ];`).join("\n")}
	light = max( light, vec3( 0.0 ) );
	e = clamp( ${encode("light")}, 0.0, 1.0 );
	return mix( e * 12.92, 1.055 * pow( e, vec3( 1.0 / 2.4 ) ) - 0.055, step( vec3( 0.0031308 ), e ) );
}
void main() {
	// The texel written, in the lightmap's own texels (or its colour's, at half the size): uSize of them.
	vec2 cell = gl_FragCoord.xy + uOrigin;
	if ( uKind > 1.5 ) {
		gl_FragColor = vec4( staysAt( cell / uSize ), 0.0, 0.0, 1.0 );
		return;
	}
	if ( uKind < 0.5 ) {
		if ( uPlain > 0.5 ) {
			// The variant's own texel, to the bit.
			gl_FragColor = vec4( pack16( textureLod( uBaseLuma, cell / uSize, 0.0 ).r ), 0.0, 1.0 );
			return;
		}
		vec3 e = encodedAt( cell, cell * 0.5, uSize, uPartialOrigin );
		gl_FragColor = vec4( pack16( 0.5 * e.g + 0.25 * ( e.r + e.b ) ), 0.0, 1.0 );
		return;
	}
	if ( uPlain > 0.5 ) {
		vec2 c = textureLod( uBaseChroma, cell / uSize, 0.0 ).rg;
		gl_FragColor = vec4( pack16( c.x ), pack16( c.y ) );
		return;
	}
	// A texel of the colour is four of the brightness: the colour of each of the four, worked out as its own,
	// by how bright each is. (The colour of their average is not it: at the edge of a face some of the four are
	// the black beside it, and the average's colour came out as a dark, tinted line along the edge.)
	vec2 sum = vec2( 0.0 );
	float weight = 0.0;
	for ( int k = 0; k < 4; k ++ ) {
		vec2 corner = vec2( float( k & 1 ), float( k >> 1 ) ) - 0.5;
		vec3 e = encodedAt( cell * 2.0 + corner, cell, uSize * 2.0, uPartialOrigin * 2.0 );
		float y = 0.5 * e.g + 0.25 * ( e.r + e.b ) + 1e-4;
		sum += y * vec2( 0.5 * ( e.r - e.b ), 0.5 * e.g - 0.25 * ( e.r + e.b ) );
		weight += y;
	}
	vec2 c = sum / weight + 128.0 / 255.0;
	gl_FragColor = vec4( pack16( c.x ), pack16( c.y ) );
}
`;
}

let onePixel = null;
/** Stand-ins for what a pass does not read: no light, no colour, all of the light staying. */
function standIns() {
    if (onePixel) return onePixel;
    const texture = (data, format) => {
        const t = new THREE.DataTexture(new Uint8Array(data), 1, 1, format);
        t.colorSpace = THREE.NoColorSpace;
        t.needsUpdate = true;
        return t;
    };
    onePixel = { black: texture([0], THREE.RedFormat), grey: texture([128, 128], THREE.RGFormat), white: texture([255], THREE.RedFormat) };
    return onePixel;
}

export default class LightResolver {
    /** How many times the shader has been built again after failing to link (usable): part of its program's key. */
    static build = 0;

    /**
     * Each room's own part of the atlas, for a lightmap `size` texels
     * square — from the bake's `zones` (each room's rectangle, [u, v, width,
     * height], v up): the texels its faces are drawn from, and those beside
     * them that they blend in. A face at the edge of its room's rectangle
     * blends in the texel whose middle lies next beyond that edge, so that
     * one is the room's own — for which there must be two texels between
     * two rooms' rectangles (the bake leaves four at 4096 at the least,
     * two in a phone's copy); and each part reaches on from there, eight
     * texels at most, as far as halfway to the next room: the texels
     * between two rooms, which the coarser mipmaps blend into both, are
     * each the nearer room's, lit and dimmed as it is.
     *
     * The brightness and the colour, at half the size, are laid out each
     * in its own texels: `luma` [x0, y0, x1, y1] in texels of the
     * brightness, `chroma` in texels of the colour. Where only two texels
     * of the brightness part two rooms, one texel of the colour is blended
     * in by both: it is the nearer room's. `outer` takes both in, in texels
     * of the brightness on whole texels of the colour (a room drawn in
     * turns is added up over it).
     *
     * Null if two rooms' rectangles lie too close for each to have the
     * texels its own faces blend in.
     *
     * @returns {Map<string, { luma: number[], chroma: number[], outer: number[] }>|null}
     */
    static regions(zones, size) {
        // (Shared with the bake, which writes each room's part by it: shared/lightRegions.js.)
        return lightRegions(zones, size);
    }

    /**
     * Whether this device draws and reads the resolved lightmap right: a
     * tiny one drawn — a texel as it is, the same texel opened out and
     * encoded again, and one with a layer added — and read back. A device
     * whose shaders are not exact enough for the 16 bits, or that does not
     * build them, keeps each room's own materials (SceneBuilder).
     *
     * Drawn with the shader the view's own resolver will use (`doors`, the
     * `encoding`s; `coded`: some rooms' parts of the lightmap held their own
     * way; `layerCurves`: some switches' layers) — its curves tried too: a
     * room's part opened out by one, a layer added by one — which is kept,
     * the tiny resolver with it, until the real one has drawn (`spare`):
     * so it is built once, here.
     */
    static usable(renderer, { doors = 1, encoding = "reinhard", layerEncoding = "reinhard", coded = false, layerCurves = false } = {}) {
        const gl = renderer.getContext();
        if (!renderer.capabilities.isWebGL2 || renderer.capabilities.maxTextures < 3 + 2 * LAYERS) return false;
        if (gl.isContextLost()) return false;
        const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
        if (!precision || precision.precision < 23) return false;
        // Whatever went wrong before this is not this drawing's.
        for (let k = 0; k < 8 && gl.getError() !== gl.NO_ERROR; k++);
        let resolver = null;
        const made = [];
        const texture = (data, format) => {
            const t = new THREE.DataTexture(new Uint8Array(data), 2, 2, format);
            t.colorSpace = THREE.NoColorSpace;
            t.magFilter = t.minFilter = THREE.LinearFilter;
            t.needsUpdate = true;
            made.push(t);
            return t;
        };
        try {
            resolver = new LightResolver(renderer, { zones: { room: [0, 0, 1, 1] }, doors, layerCurves });
            // 100 of 255, a little warm; a layer of 60 of 255, grey.
            const luma = texture([100, 100, 100, 100], THREE.RedFormat);
            const chroma = texture([140, 126, 140, 126, 140, 126, 140, 126], THREE.RGFormat);
            const layerLuma = texture([60, 60, 60, 60], THREE.RedFormat);
            const layerChroma = texture([128, 128, 128, 128, 128, 128, 128, 128], THREE.RGFormat);
            // (With rooms' curves in the shader, this room first without one: another's.)
            const base = (rooms) => resolver.setBase(luma, chroma, { encoding, scale: 1 }, 4, layerEncoding, 1, rooms);
            base(coded ? { other: CURVE } : null);
            const read = (target) => {
                const before = renderer.getRenderTarget();
                renderer.setRenderTarget(target);
                const px = new Uint8Array(4);
                gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
                renderer.setRenderTarget(before);
                return px;
            };
            resolver.flush(true);
            const plain = [read(resolver.targets.luma), read(resolver.targets.chroma)];
            // The same texel opened out and encoded again (a door, wide open but for a hair, makes it take that path).
            resolver.setDoorAtlas(standIns().white);
            resolver.setZone("room", [{ rect: [0, 0, 1, 1], at: [0, 0, 1, 1], open: 0.5 }], []);
            resolver.flush(true);
            const again = [read(resolver.targets.luma), read(resolver.targets.chroma)];
            resolver.setZone("room", [], [{ luma: layerLuma, chroma: layerChroma, rect: [0, 0, 1, 1], gain: 1 }]);
            resolver.flush(true);
            const lit = read(resolver.targets.luma);
            const value = (px, at = 0) => px[at] * 256 + px[at + 1];
            // 100 / 255 as 16 bits is 100 × 257; its colour (140, 126) likewise.
            const exact = value(plain[0]) === 100 * 257 && value(plain[1]) === 140 * 257 && value(plain[1], 2) === 126 * 257;
            const close = Math.abs(value(again[0]) - 100 * 257) <= 6 && Math.abs(value(again[1]) - 140 * 257) <= 6 && Math.abs(value(again[1], 2) - 126 * 257) <= 6;
            // The two lights added — squeezed as the bake squeezes them, (0.2023, 0.1391, 0.1139) of the scale and
            // 0.0473 of it, grey: together, encoded, a brightness of 0.4396; unsqueezed, more than the first alone.
            const squeezed = LIGHTMAP_DECODE[encoding] && LIGHTMAP_DECODE[layerEncoding] && encoding === "reinhard" && layerEncoding === "reinhard";
            const sum = squeezed ? Math.abs(value(lit) - 0.4396 * 65535) <= 200 : value(lit) > 100 * 257 + 500;
            // The curves, where the view's shader has them: the same layer read as one held its own way — 0.0196 of
            // the scale, grey, with the first light a brightness of 0.4132 — and the room's own part opened out
            // by its curve, colour stretched: 0.2443.
            let curved = true;
            if (layerCurves && squeezed) {
                resolver.setZone("room", [], [{ luma: layerLuma, chroma: layerChroma, rect: [0, 0, 1, 1], gain: 1, curve: [CURVE[0], CURVE[1], 1] }]);
                resolver.flush(true);
                curved = Math.abs(value(read(resolver.targets.luma)) - 0.4132 * 65535) <= 200;
            }
            if (coded && squeezed) {
                resolver.setZone("room", [], []);
                base({ room: CURVE });
                resolver.flush(true);
                curved = curved && Math.abs(value(read(resolver.targets.luma)) - 0.2443 * 65535) <= 200;
            }
            // Its own shader, built and linked — no other's: one of the scene's that failed says nothing of this.
            const program = renderer.properties.get(resolver.whole.luma.material).currentProgram;
            const built = Boolean(program) && program.diagnostics?.runnable !== false;
            // Now and then a driver fails to link a shader that is fine (Renderer.relinkFailed): built once more, as another program.
            if (!built && LightResolver.build < 1) {
                LightResolver.build++;
                return LightResolver.usable(renderer, { doors, encoding, layerEncoding, coded, layerCurves });
            }
            const usable = exact && close && sum && curved && built && gl.getError() === gl.NO_ERROR;
            if (!usable) console.warn("The lightmap is not resolved on this device: drawn", [...plain[0]], [...plain[1]], [...again[0]], [...again[1]], [...lit], curved ? "" : "(its curves, wrong)", built ? "" : "(its shader did not link)");
            LightResolver.spare?.dispose();
            LightResolver.spare = usable ? resolver : null;
            if (usable) resolver = null;
            return usable;
        } catch (error) {
            console.warn("The lightmap is not resolved on this device", error);
            return false;
        } finally {
            resolver?.dispose();
            for (const t of made) t.dispose();
        }
    }

    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {object} options
     * @param {object} options.zones  the bake's `zones`: each room's rectangle of the atlas
     * @param {number} [options.doors]  the most doors any room has
     * @param {boolean} [options.stays]  whether how much of each room's light stays with its doors is kept too
     *        (`stays`), for the house's materials to give the sun's light back by
     * @param {boolean} [options.layerCurves]  whether some switches' layers are held their own way (a layer's
     *        `curve`, setZone): the shader then opens those out
     * @param {boolean} [options.sunless]  whether the sun's straight light may be taken out of the variant's light
     *        (setSun): the light under a room drawn live in the bake's light (World/RoomBakeLight.js), whose sun is live
     */
    constructor(renderer, { zones, doors = 1, stays = false, layerCurves = false, sunless = false }) {
        this.renderer = renderer;
        this.zoneRects = zones;
        this.doorSlots = Math.max(1, doors);
        this.layerCoded = Boolean(layerCurves);
        this.sunless = Boolean(sunless);
        /** What is drawn: the brightness, the colour and — where it is kept — how much stays with the doors. */
        this.kinds = stays ? ["luma", "chroma", "stays"] : ["luma", "chroma"];
        this.size = 0;
        this.targets = null;
        this.scratch = [];
        this.zones = new Map();
        this.key = null;
        this.geometry = new THREE.PlaneGeometry(2, 2);
        this.camera = new THREE.Camera();
        this.scenes = { luma: new THREE.Scene(), chroma: new THREE.Scene(), stays: new THREE.Scene() };
        this.empty = new THREE.Scene();
        /** What every pass reads alike — and, sunless, the sun's mask and how much of it to take out (setSun). */
        this.shared = { uDoorAtlas: { value: standIns().white } };
        if (this.sunless) Object.assign(this.shared, { uSunMask: { value: standIns().black }, uSunScale: { value: 0 }, uSunTint: { value: new THREE.Vector3(1, 1, 1) } });
        this.base = null;
        this.baseVersion = 0;
        this.atlasVersion = 0;
        this.baseDrawn = -1;
        /** Whether a door is swinging: the mipmaps are then made again only now and then. */
        this.swinging = false;
        this.mipsStale = false;
        this.mipsAt = 0;
        /** Textures the GPU has had (a layer is uploaded the first time a pass reads it). */
        this.uploaded = new WeakSet();
        /** Where the visitor is, for the rooms nearest to be drawn first: `{ x, z }` → each room's distance, set by its owner. */
        this.distance = null;
        this.stats = { flushes: 0, zones: 0, passes: 0, whole: 0, mips: 0, ms: 0, last: 0 };
        this.restored = () => this.invalidate();
        renderer.domElement.addEventListener("webglcontextrestored", this.restored);
    }

    /** The resolved lightmap: its brightness (two bytes: R, G) and its colour (two bytes each: R, G and B, A). */
    get luma() {
        return this.targets?.luma.texture ?? null;
    }

    get chroma() {
        return this.targets?.chroma.texture ?? null;
    }

    /** How much of each room's light stays with its doors as they are (one byte; the colour's size) — where it is kept. */
    get stays() {
        return this.targets?.stays?.texture ?? null;
    }

    /** How many rooms — and the whole of it, after a change of variant — are still to be drawn. */
    get pending() {
        if (!this.base) return 0;
        let pending = this.baseDrawn === this.baseVersion ? 0 : 1;
        for (const zone of this.zones.values()) if (zone.region && zone.drawn !== zone.signature) pending++;
        return pending + (this.mipsStale && !this.swinging ? 1 : 0);
    }

    /**
     * The variant's lightmap, as it is stored: its brightness and its
     * colour (at half the size), `size` texels square.
     *
     * @param {object} info  the variant's `encoding` and `scale`
     * @param {string} [layerEncoding]  how the switches' layers are encoded
     * @param {number} [scale]  the scale the resolved lightmap is kept in (`this.scale`: what its 1 stands
     *        for, as a lightmap's `scale` is) — the variant's own, unless given: a texel no switch lights and
     *        no door dims is then the variant's, to the bit
     * @param {object} [rooms]  the rooms whose part of this lightmap is held their own way, and how — the bake's
     *        `{ zone: [knee, top, gain] }` (blender/lib/lightzones.py) — when the lightmap given is that one
     */
    setBase(luma, chroma, info, size, layerEncoding = null, scale = info.scale, rooms = null) {
        const curves = rooms && Object.keys(rooms).length ? rooms : null;
        const key = `${LIGHTMAP_DECODE[info.encoding] ? info.encoding : ""}|${LIGHTMAP_DECODE[layerEncoding] ? layerEncoding : ""}${curves ? "|rooms" : ""}${this.sunless ? "|sunless" : ""}`;
        if (size !== this.size) this.resize(size);
        if (key !== this.key) {
            this.key = key;
            this.encoding = info.encoding;
            this.layerEncoding = layerEncoding;
            this.coded = Boolean(curves);
            this.rebuild();
        }
        if (this.base && this.base.luma === luma && this.base.chroma === chroma && this.base.scale === info.scale && this.scale === scale && this.base.rooms === curves) return;
        this.base = { luma, chroma, scale: info.scale, rooms: curves };
        this.scale = scale;
        this.baseVersion++;
        // Every room held its own way is drawn, whatever else it has.
        for (const id of Object.keys(curves ?? {})) if (!this.zones.has(id)) this.setZone(id, [], []);
        for (const zone of this.zones.values()) this.sign(zone);
    }

    /**
     * The sun's straight light taken out of the variant's (`sunless` only):
     * its mask — its share of each texel's light, encoded as a lightmap's
     * brightness is, at the lightmap's own texels (blender/bake_public.py's
     * sun_mask) —, the scale that opens it out, and its colour over its
     * brightest channel (SceneBuilder's `sunTint`). None: null.
     */
    setSun(mask, scale = 0, tint = null) {
        if (!this.sunless) return;
        const shared = this.shared;
        const on = mask && scale > 0;
        const key = on ? `${mask.id}|${scale}|${tint?.toArray().join()}` : "";
        if (key === this.sunKey) return;
        this.sunKey = key;
        this.sun = on ? scale : 0;
        shared.uSunMask.value = on ? mask : standIns().black;
        if (on && tint) shared.uSunTint.value.copy(tint);
        // (Its scale in the one this is kept in: set as the base is — load.)
        this.baseVersion++;
        for (const zone of this.zones.values()) this.sign(zone);
    }

    /** How a room's part of the variant's lightmap is held, if its own way: [knee, top, gain]. */
    curveOf(zone) {
        return (zone && this.base?.rooms?.[zone.id]) || null;
    }

    /** The doors' atlas: how much of each room's light stays with each of its doors shut. */
    setDoorAtlas(texture) {
        this.shared.uDoorAtlas.value = texture ?? standIns().white;
        this.atlasVersion++;
        for (const zone of this.zones.values()) this.sign(zone);
    }

    /**
     * A room as it is now.
     *
     * @param {string} id  the room (the bake's zone)
     * @param {{ rect: number[], at: number[], open: number }[]} doors  each of its doors: the room's crop of the
     *        lightmap, where that is in the doors' atlas, and how open it is (0 shut … 1 open)
     * @param {{ luma, chroma, rect: number[], gain: number, curve?: number[] }[]} layers  each switch that is on:
     *        its layer's two textures, the crop of the lightmap they cover, and how strongly it is added — its scale
     *        times how far on it is, in the bake's own units (what a lightmap's scale is in); or, a layer held its
     *        own way (`curve`: [knee, top, gain], the bake's), only how far on it is
     */
    setZone(id, doors, layers) {
        let zone = this.zones.get(id);
        if (!zone) {
            if (!this.zoneRects?.[id]) return;
            zone = { id, doors: [], layers: [], signature: "", drawn: null, based: null, quads: null, region: null };
            this.zones.set(id, zone);
            this.place(zone);
        }
        zone.doors = doors.filter((door) => door.open <= 0.999).slice(0, this.doorSlots);
        zone.layers = layers.filter((layer) => layer.gain > 0);
        this.sign(zone);
    }

    /** What a room's rectangle holds, said in a line: drawn again only when it changes. */
    sign(zone) {
        // (A room held its own way is never the variant's texel as it is.)
        const plain = !zone.doors.length && !zone.layers.length && !this.curveOf(zone);
        zone.plain = plain;
        if (plain) {
            zone.signature = `${this.baseVersion}`;
            return;
        }
        const doors = zone.doors.length ? `${this.atlasVersion}/${zone.doors.map((door) => `${door.at[0]},${door.at[1]}:${door.open.toFixed(4)}`).join(";")}` : "";
        // (And whether it is read by a curve of its own: the same picture read the other way is another light.)
        const layers = zone.layers.map((layer) => `${layer.luma.id}:${layer.gain.toPrecision(7)}${layer.curve ? ":own" : ""}`).join(";");
        zone.signature = `${this.baseVersion}|${doors}|${layers}`;
    }

    /** Everything to be drawn again (a restored context). */
    invalidate() {
        this.baseDrawn = -1;
        this.uploaded = new WeakSet();
        for (const zone of this.zones.values()) zone.drawn = zone.based = null;
    }

    resize(size) {
        for (const target of Object.values(this.targets ?? {})) target.dispose();
        for (const pair of this.scratch) {
            pair.luma.dispose();
            pair.chroma.dispose();
        }
        this.scratch = [];
        this.size = size;
        this.regions = LightResolver.regions(this.zoneRects, size);
        if (!this.regions) {
            // (SceneBuilder.resolvesLight asks before it makes one of these: a lightmap of a size it did not ask about.)
            console.warn(`The lightmap's rooms lie too close at ${size} texels for their light to be resolved: no switch or door is drawn.`);
            this.regions = new Map();
        }
        const target = (side, format, mipmaps = true) => {
            const t = new THREE.WebGLRenderTarget(side, side, {
                format,
                type: THREE.UnsignedByteType,
                colorSpace: THREE.NoColorSpace,
                depthBuffer: false,
                stencilBuffer: false,
                magFilter: THREE.LinearFilter,
                minFilter: mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
                generateMipmaps: mipmaps,
            });
            // Drawn through the lightmap UVs, as the lightmap it stands for.
            t.texture.channel = 1;
            t.texture.flipY = false;
            t.texture.userData.lightmap = true;
            return t;
        };
        this.targets = { luma: target(size, THREE.RGFormat), chroma: target(size / 2, THREE.RGBAFormat) };
        this.targets.luma.texture.name = "resolved-light";
        this.targets.chroma.texture.name = "resolved-light-colour";
        // How much stays with the doors: read as the doors' atlas is, which has no mipmaps either.
        if (this.kinds.includes("stays")) {
            this.targets.stays = target(size / 2, THREE.RedFormat, false);
            this.targets.stays.texture.name = "resolved-light-stays";
        }
        const half = new THREE.Vector2(size / 2, size / 2);
        this.sizes = { luma: new THREE.Vector2(size, size), chroma: half, stays: half };
        this.invalidate();
        for (const zone of this.zones.values()) this.place(zone);
        this.mipsNeeded = true;
    }

    /** A room's part of the atlas (`regions`), and its quads' places in the targets. */
    place(zone) {
        zone.region = this.regions?.get(zone.id) ?? null;
        zone.drawn = zone.based = null;
        if (zone.quads) for (const kind of this.kinds) this.setQuad(zone.quads[kind], kind, this.rectOf(zone, kind));
    }

    /** A room's rectangle of the target of `kind`, in that target's texels. */
    rectOf(zone, kind) {
        return zone.region?.[kind === "luma" ? "luma" : "chroma"] ?? null;
    }

    /** A quad's place: `rect` of the target of `kind`, in its texels — or, a scratch target `into`, drawn at its corner. */
    setQuad(quad, kind, rect, into = null) {
        if (!rect) return;
        const [x0, y0, x1, y1] = rect;
        const uniforms = quad.material.uniforms;
        uniforms.uSize.value = this.sizes[kind];
        uniforms.uKind.value = KIND[kind];
        if (into) {
            uniforms.uQuad.value.set(-1, -1, -1 + (2 * (x1 - x0)) / into.width, -1 + (2 * (y1 - y0)) / into.height);
            uniforms.uOrigin.value.set(x0, y0);
        } else {
            const side = this.sizes[kind].x;
            uniforms.uQuad.value.set((2 * x0) / side - 1, (2 * y0) / side - 1, (2 * x1) / side - 1, (2 * y1) / side - 1);
            uniforms.uOrigin.value.set(0, 0);
        }
    }

    /** The materials built again (the lightmap's encoding has changed). */
    rebuild() {
        this.material?.dispose();
        this.material = new THREE.ShaderMaterial({
            name: "resolve-light",
            vertexShader: VERTEX,
            fragmentShader: fragment(this.encoding, this.layerEncoding, this.doorSlots, this.coded, this.layerCoded, this.sunless),
            depthTest: false,
            depthWrite: false,
            blending: THREE.NoBlending,
            toneMapped: false,
        });
        // (A program of its own each time it had to be built again: usable.)
        const key = `resolve-light|${LightResolver.build}${this.coded ? "|rooms" : ""}${this.layerCoded ? "|layers" : ""}${this.sunless ? "|sunless" : ""}`;
        this.programKey = () => key;
        for (const zone of this.zones.values()) {
            for (const kind of this.kinds) {
                if (!zone.quads) continue;
                this.scenes[kind].remove(zone.quads[kind].mesh);
                zone.quads[kind].material.dispose();
            }
            zone.quads = null;
            zone.drawn = null;
        }
        if (this.whole) for (const kind of this.kinds) this.whole[kind].material.dispose();
        this.whole = null;
    }

    /** A quad for each target that is drawn, in its scene. */
    quads(scenes = null) {
        return Object.fromEntries(this.kinds.map((kind) => [kind, this.quad(kind, scenes?.[kind])]));
    }

    /** A quad of one target's scene: a material of its own (its own uniforms), the one program. */
    quad(kind, scene = null) {
        const none = standIns();
        const material = this.material.clone();
        material.customProgramCacheKey = this.programKey;
        const vectors = (n) => Array.from({ length: n }, () => new THREE.Vector4(0, 0, 1, 1));
        material.uniforms = {
            ...this.shared,
            uQuad: { value: new THREE.Vector4(-1, -1, 1, 1) },
            uSize: { value: this.sizes[kind] },
            uOrigin: { value: new THREE.Vector2() },
            uKind: { value: KIND[kind] },
            uPlain: { value: 0 },
            uBaseScale: { value: 1 },
            uBaseCurve: { value: new THREE.Vector3(0, 0, 1) },
            uBaseLuma: { value: null },
            uBaseChroma: { value: null },
            uPartial: { value: 0 },
            uPartialOrigin: { value: new THREE.Vector2() },
            uPartialSize: { value: new THREE.Vector2(1, 1) },
            uDoorRect: { value: vectors(this.doorSlots) },
            uDoorAt: { value: vectors(this.doorSlots) },
            uDoorOpen: { value: new Array(this.doorSlots).fill(1) },
            uLayerRect: { value: vectors(LAYERS) },
            uLayerGain: { value: new Array(LAYERS).fill(0) },
            uLayerCurve: { value: Array.from({ length: LAYERS }, () => new THREE.Vector3(0, 0, 1)) },
        };
        for (let k = 0; k < LAYERS; k++) {
            material.uniforms[`uLayerLuma${k}`] = { value: none.black };
            material.uniforms[`uLayerChroma${k}`] = { value: none.grey };
        }
        const mesh = new THREE.Mesh(this.geometry, material);
        mesh.frustumCulled = false;
        mesh.visible = false;
        scene?.add(mesh);
        return { mesh, material };
    }

    /**
     * What a quad reads this pass: the variant's lightmap with the room's
     * doors (`first`), or what an earlier turn added up (`partial`: a
     * scratch pair), and up to LAYERS of its switches' layers.
     */
    load(quad, zone, layers, { plain = false, partial = null, kind } = {}) {
        const none = standIns();
        const uniforms = quad.material.uniforms;
        // As it is, to the bit — where it is kept in the variant's own scale, and no sun is taken out; else opened out and
        // encoded again in the other.
        uniforms.uPlain.value = plain && this.base.scale === this.scale && !(this.sun > 0) ? 1 : 0;
        uniforms.uBaseScale.value = this.base.scale / this.scale;
        if (this.sunless) uniforms.uSunScale.value = (this.sun ?? 0) / this.scale;
        // A room held its own way: its knee in the scale this is kept in, log2( 1 + top / knee ), its colour's stretch.
        const curve = partial ? null : this.curveOf(zone);
        if (curve) uniforms.uBaseCurve.value.set(curve[0] / this.scale, Math.log2(1 + curve[1] / curve[0]), curve[2] ?? 1);
        else uniforms.uBaseCurve.value.set(0, 0, 1);
        uniforms.uPartial.value = partial ? 1 : 0;
        uniforms.uBaseLuma.value = partial ? partial.luma.texture : this.base.luma;
        uniforms.uBaseChroma.value = partial ? partial.chroma.texture : this.base.chroma;
        if (partial) {
            const k = kind === "luma" ? 1 : 0.5;
            const [x0, y0, x1, y1] = zone.region.outer;
            uniforms.uPartialOrigin.value.set(x0 * k, y0 * k);
            uniforms.uPartialSize.value.set((x1 - x0) / 2, (y1 - y0) / 2);
        }
        const doors = partial || plain ? [] : zone.doors;
        for (let k = 0; k < this.doorSlots; k++) {
            const door = doors[k];
            uniforms.uDoorOpen.value[k] = door ? door.open : 1;
            if (door) {
                uniforms.uDoorRect.value[k].fromArray(door.rect);
                uniforms.uDoorAt.value[k].fromArray(door.at);
            }
        }
        const scale = this.scale;
        for (let k = 0; k < LAYERS; k++) {
            const layer = plain ? null : layers[k];
            uniforms.uLayerGain.value[k] = layer ? layer.gain / scale : 0;
            uniforms[`uLayerLuma${k}`].value = layer ? layer.luma : none.black;
            uniforms[`uLayerChroma${k}`].value = layer ? layer.chroma : none.grey;
            // One held its own way: its knee, log2( 1 + top / knee ), its colour's stretch.
            const own = layer?.curve;
            if (own) uniforms.uLayerCurve.value[k].set(own[0], Math.log2(1 + own[1] / own[0]), own[2] ?? 1);
            else uniforms.uLayerCurve.value[k].set(0, 0, 1);
            if (layer) {
                uniforms.uLayerRect.value[k].fromArray(layer.rect);
                this.uploaded.add(layer.luma);
                this.uploaded.add(layer.chroma);
            }
        }
    }

    /** A scratch pair big enough for `region` (brightness texels, on whole texels of the colour), the n-th. */
    scratchFor(region, n) {
        const width = Math.ceil((region[2] - region[0]) / 64) * 64;
        const height = Math.ceil((region[3] - region[1]) / 64) * 64;
        const had = this.scratch[n];
        if (had && had.luma.width >= width && had.luma.height >= height) return had;
        had?.luma.dispose();
        had?.chroma.dispose();
        const w = Math.max(width, had?.luma.width ?? 0);
        const h = Math.max(height, had?.luma.height ?? 0);
        const target = (tw, th, format) =>
            new THREE.WebGLRenderTarget(tw, th, {
                format,
                type: THREE.UnsignedByteType,
                colorSpace: THREE.NoColorSpace,
                depthBuffer: false,
                stencilBuffer: false,
                magFilter: THREE.LinearFilter,
                minFilter: THREE.LinearFilter,
                generateMipmaps: false,
            });
        this.scratch[n] = { luma: target(w, h, THREE.RGFormat), chroma: target(w / 2, h / 2, THREE.RGBAFormat) };
        return this.scratch[n];
    }

    /**
     * Draw what has changed. Called before every frame; costs nothing
     * while nothing has.
     *
     * @param {boolean} [all]  everything at once, however many textures that uploads
     */
    flush(all = false) {
        if (!this.base || !this.targets) return 0;
        const whole = this.baseDrawn !== this.baseVersion;
        const now = performance.now() / 1000;
        // (Stale mipmaps alone wait for their turn while a door swings.)
        const mipsDue = !this.swinging || now - this.mipsAt >= MIP_EVERY || this.mipsNeeded;
        if (!whole && !this.dirty() && !(this.mipsStale && mipsDue)) return 0;
        const renderer = this.renderer;
        const gl = renderer.getContext();
        if (gl.isContextLost()) return 0;
        const started = performance.now();
        const before = { target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(), clear: renderer.autoClear };
        const dither = gl.isEnabled(gl.DITHER);
        if (dither) gl.disable(gl.DITHER);
        renderer.autoClear = false;
        this.targets.luma.texture.generateMipmaps = false;
        this.targets.chroma.texture.generateMipmaps = false;
        let drawn = 0;

        // A new variant: the whole of it, as it is (and all of every room's light staying, until its doors are drawn).
        if (whole) {
            this.whole ??= this.quads();
            for (const kind of this.kinds) {
                const quad = this.whole[kind];
                this.setQuad(quad, kind, [0, 0, this.sizes[kind].x, this.sizes[kind].y]);
                this.load(quad, null, [], { plain: true });
                quad.mesh.visible = true;
                renderer.setRenderTarget(this.targets[kind]);
                renderer.render(quad.mesh, this.camera);
                this.stats.passes++;
            }
            this.baseDrawn = this.baseVersion;
            for (const zone of this.zones.values()) {
                zone.drawn = `${this.baseVersion}`;
                zone.based = null;
            }
            this.stats.whole++;
            drawn++;
        }

        // The rooms that have changed, the nearest first; those a first night brings in by the hundred, over a few frames.
        const dirty = [...this.zones.values()].filter((zone) => zone.region && zone.drawn !== zone.signature);
        if (this.distance && dirty.length > 1) dirty.sort((a, b) => this.distance(a.id) - this.distance(b.id));
        const together = [];
        let uploads = 0;
        let rooms = 0;
        for (const zone of dirty) {
            const fresh = zone.layers.reduce((n, layer) => n + (this.uploaded.has(layer.luma) ? 0 : 2), 0);
            if (!all && rooms && uploads + fresh > UPLOADS) {
                // Its switches wait their turn. Held its own way, its part meanwhile without them: as the whole of
                // the lightmap was just drawn (one scale for all of it) its texels are many times too bright.
                if (this.curveOf(zone) && zone.based !== this.baseVersion) {
                    zone.quads ??= this.quads(this.scenes);
                    for (const kind of this.kinds) {
                        const quad = zone.quads[kind];
                        this.setQuad(quad, kind, this.rectOf(zone, kind));
                        this.load(quad, zone, [], { kind });
                        quad.mesh.visible = true;
                        renderer.setRenderTarget(this.targets[kind]);
                        renderer.render(quad.mesh, this.camera);
                        quad.mesh.visible = false;
                        this.stats.passes++;
                    }
                    zone.based = this.baseVersion;
                    drawn++;
                }
                continue;
            }
            uploads += fresh;
            rooms++;
            drawn++;
            zone.quads ??= this.quads(this.scenes);
            if (zone.layers.length <= LAYERS) {
                for (const kind of this.kinds) {
                    this.setQuad(zone.quads[kind], kind, this.rectOf(zone, kind));
                    this.load(zone.quads[kind], zone, zone.layers, { plain: zone.plain, kind });
                    zone.quads[kind].mesh.visible = true;
                }
                together.push(zone);
            } else {
                // More switches than one pass adds: in turns, each adding to what the last left in a scratch target —
                // over all the room's part takes in (`outer`), and the last turn into the room's own rectangles.
                const turns = Math.ceil(zone.layers.length / LAYERS);
                const outer = zone.region.outer;
                for (let turn = 0; turn < turns; turn++) {
                    const layers = zone.layers.slice(turn * LAYERS, (turn + 1) * LAYERS);
                    const last = turn === turns - 1;
                    const into = last ? null : this.scratchFor(outer, turn % 2);
                    const partial = turn ? this.scratch[(turn - 1) % 2] : null;
                    for (const kind of this.kinds) {
                        const quad = zone.quads[kind];
                        // (How much stays with the doors has no switches in it: drawn once, with the last.)
                        if (kind === "stays") {
                            if (!last) continue;
                            this.setQuad(quad, kind, this.rectOf(zone, kind));
                            this.load(quad, zone, [], { kind });
                        } else {
                            this.setQuad(quad, kind, into ? outer.map((value) => (kind === "luma" ? value : value / 2)) : this.rectOf(zone, kind), into?.[kind] ?? null);
                            this.load(quad, zone, layers, { partial, kind });
                        }
                        quad.mesh.visible = true;
                        renderer.setRenderTarget(into ? into[kind] : this.targets[kind]);
                        renderer.render(quad.mesh, this.camera);
                        quad.mesh.visible = false;
                        this.stats.passes++;
                    }
                }
            }
            zone.drawn = zone.signature;
            zone.based = this.baseVersion;
            this.stats.zones++;
        }

        // The mipmaps again: with the last pass into each target — or, while a door swings, only now and then.
        if (drawn) this.mipsStale = true;
        const mips = this.mipsStale && mipsDue;
        if (together.length || mips) {
            for (const kind of this.kinds) {
                // (What stays with the doors has no mipmaps: drawn only when a room is.)
                const mipped = kind !== "stays";
                if (!together.length && !mipped) continue;
                this.targets[kind].texture.generateMipmaps = mipped && mips;
                renderer.setRenderTarget(this.targets[kind]);
                renderer.render(together.length ? this.scenes[kind] : this.empty, this.camera);
                this.targets[kind].texture.generateMipmaps = false;
                this.stats.passes++;
            }
            for (const zone of together) for (const kind of this.kinds) zone.quads[kind].mesh.visible = false;
        }
        if (mips) {
            this.mipsStale = false;
            this.mipsNeeded = false;
            this.mipsAt = now;
            this.stats.mips++;
        }

        renderer.setRenderTarget(before.target, before.face, before.mip);
        renderer.autoClear = before.clear;
        if (dither) gl.enable(gl.DITHER);
        // The tiny one that tried the shader out, kept so that it was not built twice: no longer needed.
        if (LightResolver.spare && LightResolver.spare !== this) {
            LightResolver.spare.dispose();
            LightResolver.spare = null;
        }
        this.stats.flushes++;
        this.stats.last = performance.now() - started;
        this.stats.ms += this.stats.last;
        return drawn;
    }

    dirty() {
        for (const zone of this.zones.values()) if (zone.region && zone.drawn !== zone.signature) return true;
        return false;
    }

    dispose() {
        if (LightResolver.spare === this) LightResolver.spare = null;
        this.renderer.domElement.removeEventListener("webglcontextrestored", this.restored);
        for (const target of Object.values(this.targets ?? {})) target.dispose();
        for (const pair of this.scratch) {
            pair.luma.dispose();
            pair.chroma.dispose();
        }
        for (const zone of this.zones.values()) {
            if (zone.quads) for (const kind of this.kinds) zone.quads[kind].material.dispose();
        }
        if (this.whole) for (const kind of this.kinds) this.whole[kind].material.dispose();
        this.material?.dispose();
        this.geometry.dispose();
    }
}

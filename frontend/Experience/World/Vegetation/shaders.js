// =============================================================================
//
//   The trees and the hills' grass are Fluffy Tree - Three.js's
//   (https://github.com/leoawen/fluffytree-threejs), drawn as its demo draws
//   them: its canopy's volumetric gradient and its leaves' wind, its grass's
//   wind and its colour from root to tip, worked out on the screen's own
//   colours, and its shadow darkening — lit by its demo's ambient light and
//   sun. The lawns' blades (bladeMaterial) are Isaac Mason's sketches'
//   (https://github.com/isaac-mason/sketches, nature/grass, MIT — its notice
//   is in public/textures/vegetation/LICENSE.md), whose simplex noise is
//   Ashima Arts' webgl-noise (MIT). The lawn's shells are this project's own.
//
//   MIT License
//   Copyright (c) 2025 Leonardo Soares Gonçalves
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all
//   copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.
//
// =============================================================================

import * as THREE from "three";

import { LIGHTMAP_DECODE, LIGHTMAP_YCOCG } from "../lightmapGLSL.js";

/**
 * What every garden material shares, and Vegetation.js keeps up to date:
 * the time, for the wind; the garden's settings (applySettings); and the
 * light.
 *
 * The light is Fluffy Tree's demo's — an ambient light and a sun, white,
 * their strengths the garden's settings — from the scene's sun, or the
 * bake's (Vegetation.setLight): it falls on the trees and the grass alike
 * whatever the house is lit by. Live, the sun's shadow map says what is in
 * its shadow; baked, which has none, the ground's lightmap under each root
 * does (`ground`: Vegetation.useGroundLight).
 */
export const uniforms = {
    uTime: { value: 0 },

    uAmbient: { value: 1.5 },
    uDirectional: { value: 1.5 },
    // Towards the sun.
    uSunDirection: { value: new THREE.Vector3(0.5, 0.7, 0.3).normalize() },
    // All of the light, by day; at night, the night's share of the day's.
    uLightScale: { value: 1 },
    // How dark what is in the sun's shadow is drawn: the trunks' (Fluffy
    // Tree's global shadow intensity).
    uShadowDarkness: { value: 0.2 },

    // Baked: the ground's lightmap and how its light is opened out; the
    // sun's and the sky's light on open ground, for the lightmap's variant
    // and by day, to tell sun from shade in it; and whether it is night.
    uGroundLuma: { value: null },
    uGroundChroma: { value: null },
    uGroundScale: { value: 1 },
    uSunLuminance: { value: 1 },
    uSkyLuminance: { value: 0.5 },
    uDayLuminance: { value: 1.5 },
    uNight: { value: 0 },

    // The hills' grass.
    uTuftBase: { value: new THREE.Color() },
    uTuftTip: { value: new THREE.Color() },
    uTuftShadowDarkness: { value: 0.3 },
    uTuftWindStrength: { value: 0.06 },
    uTuftWindSpeed: { value: 1.2 },
    uTuftWindDirection: { value: new THREE.Vector2(0.8, 0.6) },
    // A card's length and width, and its lean.
    uTuftSize: { value: 0.9 },
    uTuftLean: { value: 0.33 },

    // The leaves.
    uLeafShadowColor: { value: new THREE.Color() },
    uLeafLitColor: { value: new THREE.Color() },
    uLeafHighlightColor: { value: new THREE.Color() },
    uGradientStart: { value: -1 },
    uGradientEnd: { value: 2.7 },
    uHighlightStart: { value: 0.5 },
    uHighlightEnd: { value: 1.8 },
    uLeafShadowDarkness: { value: 0.2 },
    uLeafWindStrength: { value: 0.05 },
    uLeafWindFrequency: { value: 5 },
    uLeafWindSpeed: { value: 0.4 },

    // The lawns' blades: how wide, and how tall before each is stretched.
    uBladeWidth: { value: 0.015 },
    uBladeHeight: { value: 0.12 },

    // The shells' wind: a breath across the lawn, leaning the tips a few millimetres.
    uWindStrength: { value: 0.004 },
    uWindSpeed: { value: 1.2 },
    uWindDirection: { value: new THREE.Vector2(0.8, 0.6) },
};

/**
 * The garden's settings (shared/garden.js's gardenSettings) into the
 * uniforms: everything that changes how the garden looks without its
 * being grown again.
 */
export function applySettings({ lighting, tufts, leaves, blades }) {
    uniforms.uAmbient.value = lighting.ambient;
    uniforms.uDirectional.value = lighting.directional;
    uniforms.uShadowDarkness.value = lighting.shadowDarkness;

    uniforms.uTuftBase.value.set(tufts.baseColor);
    uniforms.uTuftTip.value.set(tufts.tipColor);
    uniforms.uTuftShadowDarkness.value = tufts.shadowDarkness;
    uniforms.uTuftWindStrength.value = tufts.windStrength;
    uniforms.uTuftWindSpeed.value = tufts.windSpeed;
    uniforms.uTuftWindDirection.value.set(tufts.windX, tufts.windZ);
    uniforms.uTuftSize.value = tufts.size;
    uniforms.uTuftLean.value = tufts.lean;

    uniforms.uLeafShadowColor.value.set(leaves.shadowColor);
    uniforms.uLeafLitColor.value.set(leaves.litColor);
    uniforms.uLeafHighlightColor.value.set(leaves.highlightColor);
    uniforms.uGradientStart.value = leaves.gradientStart;
    uniforms.uGradientEnd.value = leaves.gradientEnd;
    uniforms.uHighlightStart.value = leaves.highlightStart;
    uniforms.uHighlightEnd.value = leaves.highlightEnd;
    uniforms.uLeafShadowDarkness.value = leaves.shadowDarkness;
    uniforms.uLeafWindStrength.value = leaves.windStrength;
    uniforms.uLeafWindFrequency.value = leaves.windFrequency;
    uniforms.uLeafWindSpeed.value = leaves.windSpeed;

    uniforms.uBladeWidth.value = blades.width;
    uniforms.uBladeHeight.value = blades.height;
}

/**
 * Where Fluffy Tree's demo has its tree's foot (public/models/fluffy-tree.glb
 * stands it at the origin): its leaves' wind is worked out where the demo
 * has them.
 */
const FLUFFY_ORIGIN = "vec3( 0.036, 3.925, -0.008 )";

/** Perlin noise, for the leaves' wind (Fluffy Tree). */
const NOISE = /* glsl */ `
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
vec3 fade(vec3 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}
float cnoise(vec3 P){
	vec3 Pi0 = floor(P); vec3 Pi1 = Pi0 + vec3(1.0); Pi0 = mod(Pi0, 289.0); Pi1 = mod(Pi1, 289.0);
	vec3 Pf0 = fract(P); vec3 Pf1 = Pf0 - vec3(1.0);
	vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x); vec4 iy = vec4(Pi0.yy, Pi1.yy);
	vec4 iz0 = Pi0.zzzz; vec4 iz1 = Pi1.zzzz;
	vec4 ixy = permute(permute(ix) + iy); vec4 ixy0 = permute(ixy + iz0); vec4 ixy1 = permute(ixy + iz1);
	vec4 gx0 = ixy0 / 7.0; vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5; gx0 = fract(gx0);
	vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0); vec4 sz0 = step(gz0, vec4(0.0));
	gx0 -= sz0 * (step(0.0, gx0) - 0.5); gy0 -= sz0 * (step(0.0, gy0) - 0.5);
	vec4 gx1 = ixy1 / 7.0; vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5; gx1 = fract(gx1);
	vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1); vec4 sz1 = step(gz1, vec4(0.0));
	gx1 -= sz1 * (step(0.0, gx1) - 0.5); gy1 -= sz1 * (step(0.0, gy1) - 0.5);
	vec3 g000 = vec3(gx0.x,gy0.x,gz0.x); vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
	vec3 g010 = vec3(gx0.z,gy0.z,gz0.z); vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
	vec3 g001 = vec3(gx1.x,gy1.x,gz1.x); vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
	vec3 g011 = vec3(gx1.z,gy1.z,gz1.z); vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);
	vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
	g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
	vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
	g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;
	float n000 = dot(g000, Pf0); float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
	float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z)); float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
	float n001 = dot(g001, vec3(Pf0.xy, Pf1.z)); float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
	float n011 = dot(g011, vec3(Pf0.x, Pf1.yz)); float n111 = dot(g111, Pf1);
	vec3 fade_xyz = fade(Pf0); vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
	vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y); float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
	return 2.2 * n_xyz;
}
`;

/** The sun's shadow on this fragment: 1 in the light, 0 in the shade (Fluffy Tree's getShadow). */
const SHADOW = /* glsl */ `
	float sunShadow = 1.0;
	#if defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 )
		if ( receiveShadow ) sunShadow = getShadow(
			directionalShadowMap[ 0 ],
			directionalLightShadows[ 0 ].shadowMapSize,
			directionalLightShadows[ 0 ].shadowBias,
			directionalLightShadows[ 0 ].shadowRadius,
			vDirectionalShadowCoord[ 0 ]
		);
	#endif
`;

/** The demo's light: its ambient light, and its sun on what faces it and is not in its shadow. */
const DEMO_LIGHT = /* glsl */ `
uniform float uAmbient;
uniform float uDirectional;
uniform vec3 uSunDirection;
uniform float uLightScale;
float demoLight( vec3 viewNormal, float shadow ) {
	vec3 sunward = normalize( ( viewMatrix * vec4( uSunDirection, 0.0 ) ).xyz );
	// Over π, as a Lambert surface gives back what falls on it.
	return ( uAmbient + uDirectional * max( dot( viewNormal, sunward ), 0.0 ) * shadow ) * 0.3183098862;
}
`;

/**
 * A colour as the screen shows it: tone-mapped as the view is, then
 * encoded as it is — the value Fluffy Tree's grass reads back off its
 * fragment once three has drawn it.
 */
const DISPLAYED = /* glsl */ `
vec3 displayed( vec3 colour ) {
	#ifdef TONE_MAPPING
		colour = toneMapping( colour );
	#endif
	return linearToOutputTexel( vec4( colour, 1.0 ) ).rgb;
}
`;

/**
 * Baked, for the vertex shader: the light in the ground's lightmap at a
 * root (`aGroundUv`), opened back out; and, from it, `groundShares`: how
 * much of the sun reaches there (x: 0 in its shade, 1 in the open) and,
 * at night, how much light there is next to the day's in the open (y).
 */
function groundGLSL({ encoding, storage }) {
    const decode = LIGHTMAP_DECODE[encoding] ?? ((e) => e);
    const chroma = storage === "ycocg";
    return /* glsl */ `
	uniform sampler2D uGroundLuma;
	uniform sampler2D uGroundChroma;
	uniform float uGroundScale;
	uniform float uSunLuminance;
	uniform float uSkyLuminance;
	uniform float uDayLuminance;
	uniform float uNight;
	attribute vec2 aGroundUv;
	${chroma ? LIGHTMAP_YCOCG : ""}
	vec3 groundLight( vec2 uv ) {
		${chroma ? "vec3 e = ycocgColour( texture2D( uGroundLuma, uv ).r, texture2D( uGroundChroma, uv ).rg );" : "vec3 e = texture2D( uGroundLuma, uv ).rgb;"}
		return ${decode("e")} * uGroundScale;
	}
	vec2 groundShares( vec3 light ) {
		float luminance = dot( light, vec3( 0.2126, 0.7152, 0.0722 ) );
		float sunlit = clamp( ( luminance - uSkyLuminance ) / max( uSunLuminance, 1e-4 ), 0.0, 1.0 );
		return vec2( mix( sunlit, 1.0, uNight ), mix( 1.0, luminance / uDayLuminance, uNight ) );
	}`;
}

/** A material's program, told apart by what it is and how it is lit. */
function cacheKey(name, ground) {
    return ground ? `${name}|${ground.encoding}|${ground.storage}` : `${name}|live`;
}

/** A card of the hills' grass, stood at its size, leaning, and swaying in the wind. */
const TUFT_VERTEX = /* glsl */ `
	uniform float uTime;
	uniform float uTuftWindStrength;
	uniform float uTuftWindSpeed;
	uniform vec2 uTuftWindDirection;
	uniform float uTuftSize;
	uniform float uTuftLean;
	varying float vHeight;
`;
const TUFT_BEGIN_VERTEX = /* glsl */ `
	vHeight = uv.y;
	vec3 transformed = vec3( position.x, position.y * sqrt( 1.0 - uTuftLean * uTuftLean ), position.y * uTuftLean ) * uTuftSize;
	// The wind across the hills (the demo's): the higher up the card, the more it sways.
	vec4 windAt = modelMatrix * instanceMatrix * vec4( transformed, 1.0 );
	float gust = sin( windAt.x * 0.5 + uTime * uTuftWindSpeed ) + sin( windAt.z * 0.3 + uTime * uTuftWindSpeed * 0.7 );
	vec2 windward = length( uTuftWindDirection ) > 0.0 ? normalize( uTuftWindDirection ) : vec2( 0.0 );
	vec2 sway = windward * gust * uTuftWindStrength * vHeight;
	transformed += inverse( mat3( instanceMatrix ) ) * vec3( sway.x, 0.0, sway.y );
`;

/**
 * The hills' grass, Fluffy Tree's: instanced cards of its grass texture
 * (build.js's tuftGeometry), each `uTuftSize` long and wide at its own
 * scale, leaning over by `uTuftLean` of its length. The wind sways the
 * tips, not the roots.
 *
 * Its colour is the demo's: the card is lit — by the demo's light, on its
 * own face, darker in the sun's shadow — and drawn to the screen; that
 * light, as the screen shows it, over the texture's own colour, is how lit
 * it is; and a green from root to tip lit that much, and darker still in
 * the shadow, is what is drawn. That the light is read back in screen
 * colours is what makes it so vivid. What is drawn is fogged as anything
 * else is.
 *
 * @param {THREE.Texture} texture  the grass card
 * @param {object} [ground]  baked: the ground's lightmap's `{ encoding, storage }`
 */
export function tuftMaterial(texture, ground = null) {
    const material = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide });
    material.name = "hill-grass";
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = /* glsl */ `
			${TUFT_VERTEX}
			${ground ? `${groundGLSL(ground)}\nvarying vec2 vGround;` : ""}
			${shader.vertexShader}
		`
            .replace(
                "#include <beginnormal_vertex>",
                // Its face's, the side it leans away from: up, and back.
                "vec3 objectNormal = vec3( 0.0, uTuftLean, -sqrt( 1.0 - uTuftLean * uTuftLean ) );"
            )
            .replace(
                "#include <begin_vertex>",
                /* glsl */ `
			${TUFT_BEGIN_VERTEX}
			${ground ? "vGround = groundShares( groundLight( aGroundUv ) );" : ""}
			`
            );
        shader.fragmentShader = /* glsl */ `
			uniform vec3 uTuftBase;
			uniform vec3 uTuftTip;
			uniform float uTuftShadowDarkness;
			varying float vHeight;
			${ground ? "varying vec2 vGround;" : ""}
			${DEMO_LIGHT}
			${DISPLAYED}
			${shader.fragmentShader}
		`.replace(
            "#include <fog_fragment>",
            /* glsl */ `
			${SHADOW}
			// Baked, the house's and the trees' shade is the ground's, and the
			// grass's own, on itself, the shadow map's.
			${ground ? "float shadow = min( vGround.x, sunShadow );\n\t\t\tfloat lightScale = vGround.y;" : "float shadow = sunShadow;\n\t\t\tfloat lightScale = uLightScale;"}
			vec3 textureColour = texture2D( map, vMapUv ).rgb;
			vec3 lighting = displayed( textureColour * demoLight( normal, shadow ) * lightScale ) / max( textureColour, vec3( 1e-4 ) );
			vec3 grassColour = mix( uTuftBase, uTuftTip, vHeight ) * lighting;
			gl_FragColor = vec4( mix( grassColour * uTuftShadowDarkness, grassColour, shadow ), 1.0 );
			#include <fog_fragment>
			`
        );
    };
    material.customProgramCacheKey = () => cacheKey("hill-grass", ground);
    return material;
}

/**
 * The hills' grass as the sun's shadow map sees it: each card stood,
 * leant and swaying as it is drawn, so its shadow falls where it is, and
 * not on itself. Its shape (the texture's alpha) is the drawn material's.
 */
export function tuftDepthMaterial() {
    const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = `${TUFT_VERTEX}\n${shader.vertexShader}`.replace("#include <begin_vertex>", TUFT_BEGIN_VERTEX);
    };
    material.customProgramCacheKey = () => "hill-grass-depth";
    return material;
}

/**
 * A tree's crown (Fluffy Tree's): cards of its leaf texture, their shape
 * the texture (as an alpha map). Its volumetric gradient colours each leaf
 * by which way it is from the middle of its clump, towards the sun or away
 * — so a clump is shaded as one soft mass, not card by card — darker in the
 * sun's shadow; every leaf is lit as if it faced up; and gusts of noise
 * stir it, the more the higher up.
 *
 * Its clumps are Fluffy Tree's tree's, one instance a tree, the middle of
 * each `centre`; a bush's (no `centre`) are made here (build.js), each
 * leaf's clump's middle, and how much the wind moves it, its own
 * (`aCenter`, `aSway`).
 *
 * @param {THREE.Texture} alphaMap  the leaves
 * @param {THREE.Vector3} [centre]  a clump's middle, in the tree's own space
 */
export function canopyMaterial(alphaMap, centre = null) {
    const material = new THREE.MeshLambertMaterial({ alphaMap, alphaTest: 0.5, side: THREE.DoubleSide });
    material.name = "leaves";
    const own = centre ? { uClumpCentre: { value: centre } } : {};
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms, own);
        shader.vertexShader = /* glsl */ `
			uniform float uTime;
			uniform float uLeafWindStrength;
			uniform float uLeafWindFrequency;
			uniform float uLeafWindSpeed;
			${centre ? "uniform vec3 uClumpCentre;" : "attribute vec3 aCenter;\n\t\t\tattribute float aSway;"}
			varying vec3 vWorldPosition;
			varying vec3 vCenter;
			${NOISE}
			${shader.vertexShader}
		`.replace(
            "#include <begin_vertex>",
            /* glsl */ `
			#include <begin_vertex>
			float windTime = uTime * uLeafWindSpeed;
			${
                centre
                    ? /* glsl */ `
			// Where the demo has this leaf; and each tree its own gusts.
			vec3 demo = position + ${FLUFFY_ORIGIN};
			windTime += instanceMatrix[ 3 ].x * 0.37 + instanceMatrix[ 3 ].z * 0.23;
			float gust = cnoise( vec3( demo.x * uLeafWindFrequency, demo.y * uLeafWindFrequency, windTime ) );
			transformed += normalize( vec3( 1.0, 0.0, 1.0 ) ) * gust * uLeafWindStrength * ( demo.y / 8.0 );
			mat4 placed = modelMatrix * instanceMatrix;
			vCenter = ( placed * vec4( uClumpCentre, 1.0 ) ).xyz;`
                    : /* glsl */ `
			float gust = cnoise( vec3( position.x * uLeafWindFrequency, position.y * uLeafWindFrequency, windTime ) );
			transformed += normalize( vec3( 1.0, 0.0, 1.0 ) ) * gust * uLeafWindStrength * aSway;
			mat4 placed = modelMatrix;
			vCenter = ( placed * vec4( aCenter, 1.0 ) ).xyz;`
            }
			vWorldPosition = ( placed * vec4( transformed, 1.0 ) ).xyz;
			`
        );
        shader.fragmentShader = /* glsl */ `
			uniform vec3 uLeafShadowColor;
			uniform vec3 uLeafLitColor;
			uniform vec3 uLeafHighlightColor;
			uniform float uGradientStart;
			uniform float uGradientEnd;
			uniform float uHighlightStart;
			uniform float uHighlightEnd;
			uniform float uLeafShadowDarkness;
			varying vec3 vWorldPosition;
			varying vec3 vCenter;
			${DEMO_LIGHT}
			${shader.fragmentShader}
		`
            .replace(
                "#include <color_fragment>",
                /* glsl */ `
			#include <color_fragment>
			${SHADOW}
			// The volumetric gradient: from the middle of the clump out to
			// this leaf, and how squarely that faces the sun.
			float lightAlignment = dot( normalize( vWorldPosition - vCenter ), uSunDirection );
			vec3 leafColour = mix( uLeafShadowColor, uLeafLitColor, smoothstep( uGradientStart, uGradientEnd, lightAlignment ) );
			leafColour = mix( leafColour, uLeafHighlightColor, smoothstep( uHighlightStart, uHighlightEnd, lightAlignment ) );
			diffuseColor.rgb = mix( leafColour * uLeafShadowDarkness, leafColour, sunShadow );
			`
            )
            .replace(
                "#include <normal_fragment_begin>",
                // Every leaf facing up, so no card goes dark and thin edge-on.
                "#include <normal_fragment_begin>\n\tnormal = normalize( mat3( viewMatrix ) * vec3( 0.0, 1.0, 0.0 ) );"
            )
            .replace(
                "#include <opaque_fragment>",
                "outgoingLight = diffuseColor.rgb * demoLight( normal, sunShadow ) * uLightScale;\n\t#include <opaque_fragment>"
            );
    };
    material.customProgramCacheKey = () => (centre ? "leaves|tree" : "leaves|bush");
    return material;
}

/**
 * Fluffy Tree's trunk: its own colour, lit by the demo's light, and
 * darker in the sun's shadow by the garden's shadow intensity.
 *
 * @param {THREE.Color} colour
 */
export function barkMaterial(colour) {
    const material = new THREE.MeshLambertMaterial({ color: colour });
    material.name = "bark";
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.fragmentShader = /* glsl */ `
			uniform float uShadowDarkness;
			${DEMO_LIGHT}
			${shader.fragmentShader}
		`.replace(
            "#include <opaque_fragment>",
            /* glsl */ `
			${SHADOW}
			outgoingLight = diffuseColor.rgb * demoLight( normal, sunShadow ) * uLightScale;
			outgoingLight = mix( outgoingLight * uShadowDarkness, outgoingLight, sunShadow );
			#include <opaque_fragment>
			`
        );
    };
    material.customProgramCacheKey = () => "bark";
    return material;
}

/** The sketch's blades' greens, root, middle and tip: two sorts. */
export const BLADES = [
    { base: new THREE.Color("#138510"), middle: new THREE.Color("#41980a"), tip: new THREE.Color("#a1d433") },
    { base: new THREE.Color("#227d1f"), middle: new THREE.Color("#2da329"), tip: new THREE.Color("#6ebd2d") },
];

/** Simplex noise (Ashima Arts' webgl-noise), for the blades' wind. */
const SNOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute3(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
	const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
	vec2 i = floor(v + dot(v, C.yy));
	vec2 x0 = v - i + dot(i, C.xx);
	vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
	vec4 x12 = x0.xyxy + C.xxzz;
	x12.xy -= i1;
	i = mod289(i);
	vec3 p = permute3(permute3(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
	vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
	m = m * m;
	m = m * m;
	vec3 x = 2.0 * fract(p * C.www) - 1.0;
	vec3 h = abs(x) - 0.5;
	vec3 ox = floor(x + 0.5);
	vec3 a0 = x - ox;
	m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
	vec3 g;
	g.x = a0.x * x0.x + h.x * x0.y;
	g.yz = a0.yz * x12.xz + h.yz * x12.yw;
	return 130.0 * dot(m, g);
}
`;

/**
 * Quaternions: turning a vector by one, multiplying two, and blending
 * between two — the sketch slerps; for a lean of a quarter radian at most,
 * a normalised blend bends the blade the same for a fraction of the work,
 * done at every one of its vertices.
 */
const QUATERNIONS = /* glsl */ `
vec3 rotateVectorByQuaternion(vec3 v, vec4 q) {
	return 2.0 * cross(q.xyz, v * q.w + cross(q.xyz, v)) + v;
}
vec4 quaternionMultiply(vec4 a, vec4 b) {
	return vec4(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz));
}
vec4 nlerp(vec4 v0, vec4 v1, float t) {
	return normalize(mix(v0, dot(v0, v1) < 0.0 ? -v1 : v1, t));
}
`;

/**
 * The lawns' grass, blade by blade: the sketch's. Each blade is a strip of
 * a few joints cut to the blade texture's shape, rooted at `aOffset` and
 * made its own by `aRandom` — turned about its root, leaning over by its
 * tip (blended from upright to its lean up its length, so it bends rather
 * than tilts), stretched — a third of them up to 2.8 times `uBladeHeight`,
 * the rest up to twice — and one of two sorts of green — and stirred by a
 * swell of simplex noise that crosses the garden.
 *
 * Its colour is the sketch's, as it draws it: its greens from root to
 * middle to tip, not lit and not tone-mapped, and darker where the sketch
 * has its clouds' shadow — here the sun's (live; baked, the ground's
 * lightmap at its root, `aGroundUv`).
 *
 * @param {THREE.Texture} alpha  the blade's shape
 * @param {object} [ground]  baked: the ground's lightmap's `{ encoding, storage }`
 */
export function bladeMaterial(alpha, ground = null) {
    const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    material.name = "grass-blades";
    material.toneMapped = false;
    const own = {
        uBladeAlpha: { value: alpha },
        uBladeBase: { value: BLADES.map((colours) => colours.base) },
        uBladeMiddle: { value: BLADES.map((colours) => colours.middle) },
        uBladeTip: { value: BLADES.map((colours) => colours.tip) },
    };
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms, own);
        shader.vertexShader = /* glsl */ `
			uniform float uTime;
			uniform float uBladeWidth;
			uniform float uBladeHeight;
			attribute vec3 aOffset;
			attribute vec4 aRandom;
			varying float vRelativeY;
			varying float vPalette;
			varying vec2 vBladeUv;
			${SNOISE}
			${QUATERNIONS}
			${ground ? `${groundGLSL(ground)}\nvarying vec2 vGround;` : ""}
			${shader.vertexShader}
		`.replace(
            "#include <project_vertex>",
            /* glsl */ `
			vRelativeY = position.y;
			vBladeUv = uv;
			vPalette = aRandom.w;
			// Turned about its root, and leaning over to its tip (a quarter
			// radian at most, either way on each axis), bending up its length.
			float turn = 3.14159265 - aRandom.x * 6.28318531;
			vec4 upright = vec4( 0.0, sin( turn * 0.5 ), 0.0, cos( turn * 0.5 ) );
			float leanX = ( aRandom.y - 0.5 ) * 0.5;
			float leanZ = ( aRandom.z - 0.5 ) * 0.5;
			vec4 leaning = quaternionMultiply( quaternionMultiply( upright, vec4( sin( leanX * 0.5 ), 0.0, 0.0, cos( leanX * 0.5 ) ) ), vec4( 0.0, 0.0, sin( leanZ * 0.5 ), cos( leanZ * 0.5 ) ) );
			vec4 direction = nlerp( upright, leaning, vRelativeY );
			float stretch = fract( aRandom.x * 7.31 + aRandom.w * 3.17 ) * ( fract( aRandom.y * 13.7 + aRandom.z * 5.3 ) < 0.3333 ? 1.8 : 1.0 );
			vec3 blade = rotateVectorByQuaternion( vec3( position.x * uBladeWidth, position.y * uBladeHeight * ( 1.0 + stretch ), position.z ), direction );
			// The wind: a swell of noise that crosses the garden.
			float adjustedTime = uTime * 0.1;
			float noise = 1.0 - snoise( vec2( adjustedTime - aOffset.x / 50.0, adjustedTime - aOffset.z / 50.0 ) );
			float halfAngle = noise * 0.15;
			blade = rotateVectorByQuaternion( blade, normalize( vec4( sin( halfAngle ), 0.0, -sin( halfAngle ), cos( halfAngle ) ) ) );
			vec4 mvPosition = modelViewMatrix * vec4( aOffset + blade, 1.0 );
			gl_Position = projectionMatrix * mvPosition;
			${ground ? "vGround = groundShares( groundLight( aGroundUv ) );" : ""}
			`
        );
        shader.fragmentShader = /* glsl */ `
			uniform sampler2D uBladeAlpha;
			uniform vec3 uBladeBase[ 2 ];
			uniform vec3 uBladeMiddle[ 2 ];
			uniform vec3 uBladeTip[ 2 ];
			uniform float uLightScale;
			varying float vRelativeY;
			varying float vPalette;
			varying vec2 vBladeUv;
			${ground ? "varying vec2 vGround;" : ""}
			${shader.fragmentShader}
		`
            .replace(
                "#include <clipping_planes_fragment>",
                /* glsl */ `
			#include <clipping_planes_fragment>
			if ( texture2D( uBladeAlpha, vBladeUv ).r < 0.15 ) discard;
			`
            )
            .replace(
                "#include <opaque_fragment>",
                /* glsl */ `
			// Root to middle to tip (the sketch's gradient), of one sort or the other.
			vec3 base = vPalette < 0.5 ? uBladeBase[ 0 ] : uBladeBase[ 1 ];
			vec3 middle = vPalette < 0.5 ? uBladeMiddle[ 0 ] : uBladeMiddle[ 1 ];
			vec3 tip = vPalette < 0.5 ? uBladeTip[ 0 ] : uBladeTip[ 1 ];
			vec3 bladeColour = mix( mix( base, middle, vRelativeY ), mix( middle, tip, vRelativeY ), vRelativeY );
			${ground ? "float shadow = vGround.x;\n\t\t\tfloat lightScale = vGround.y;" : `${SHADOW}\n\t\t\tfloat shadow = sunShadow;\n\t\t\tfloat lightScale = uLightScale;`}
			// The sketch's: seven tenths of it near the ground, and three
			// tenths of that where its clouds' shadow is — here the sun's.
			outgoingLight = bladeColour * 0.7 * mix( 0.3, 1.0, shadow ) * lightScale;
			#include <opaque_fragment>
			`
            );
    };
    material.customProgramCacheKey = () => cacheKey("grass-blades", ground);
    return material;
}

/**
 * The lawn: shells. The lawn's surface is drawn again in thin layers, one
 * over another (each an instance, its height `aShell`, 0..1 of `uHeight`),
 * and each layer keeps only where a blade reaches it — the blade map
 * (build.js), tiled over the lawn twice, at two scales and turned, so it
 * never visibly repeats. Every pixel of lawn has blades, packed a few
 * millimetres apart and cut to one height: the dense short turf of a
 * mown lawn, for a few triangles a layer.
 *
 * A blade's colour is the lawn's own texture where it stands — as the lawn
 * is mapped (`uTurfTransform`: its texture's placing) — darker at the
 * root, where the blades shade one another, and lighter at the tip; the
 * wind leans the tips. Further off, the blades shorten to nothing
 * (`uFadeStart` to `uFadeEnd`) and leave the lawn's texture alone, which
 * is all there is to see from there.
 *
 * Lit two ways:
 *   - live, by the scene's lights, as the lawn is;
 *   - baked (`ground`), by the lawn's own lightmap, read at the lawn's
 *     lightmap UV (`aGroundUv`, Vegetation.useGroundLight): the house's
 *     shadow, the trees' shade, day or night, exactly as on the lawn.
 *
 * @param {THREE.Texture} turf  the lawn's texture
 * @param {number} tile  the metres one repeat of it covers
 * @param {THREE.Texture} blades  the blade map
 * @param {object} options  `{ height, fadeStart, fadeEnd }`, and, baked,
 *        `ground`: the lawn's lightmap's `{ encoding, storage }`
 */
export function lawnMaterial(turf, tile, blades, { height, fadeStart, fadeEnd, ground = null }) {
    const material = ground ? new THREE.MeshBasicMaterial() : new THREE.MeshLambertMaterial();
    // Only ever seen from above: its pieces are wound to face up (build.js).
    material.name = "lawn-shells";
    const own = {
        uTurf: { value: turf },
        uTurfTile: { value: tile },
        uTurfTransform: { value: turf.matrix },
        uBlades: { value: blades },
        uBladeTile: { value: 0.25 },
        uHeight: { value: height },
        uFadeStart: { value: fadeStart },
        uFadeEnd: { value: fadeEnd },
    };
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms, own);
        shader.vertexShader = /* glsl */ `
			uniform float uHeight;
			attribute float aShell;
			varying float vShell;
			varying vec3 vShellAt;
			${ground ? `${groundGLSL(ground)}\nvarying vec3 vGroundLight;` : ""}
			${shader.vertexShader}
		`.replace(
            "#include <project_vertex>",
            /* glsl */ `
			vShell = aShell;
			vec4 mvPosition = vec4( transformed + vec3( 0.0, aShell * uHeight, 0.0 ), 1.0 );
			vShellAt = ( modelMatrix * mvPosition ).xyz;
			mvPosition = modelViewMatrix * mvPosition;
			gl_Position = projectionMatrix * mvPosition;
			${ground ? "vGroundLight = groundLight( aGroundUv );" : ""}
			`
        );
        shader.fragmentShader = /* glsl */ `
			uniform float uTime;
			uniform float uWindStrength;
			uniform float uWindSpeed;
			uniform vec2 uWindDirection;
			uniform sampler2D uTurf;
			uniform float uTurfTile;
			uniform mat3 uTurfTransform;
			uniform sampler2D uBlades;
			uniform float uBladeTile;
			uniform float uFadeStart;
			uniform float uFadeEnd;
			varying float vShell;
			varying vec3 vShellAt;
			${ground ? "varying vec3 vGroundLight;" : ""}
			${shader.fragmentShader}
		`
            .replace(
                "#include <clipping_planes_fragment>",
                /* glsl */ `
			#include <clipping_planes_fragment>
			// Shorter blades further off, and none at all past uFadeEnd.
			float reach = 1.0 - smoothstep( uFadeStart, uFadeEnd, distance( cameraPosition, vShellAt ) );
			// The wind leans the tips: the higher the shell, the further it looks for its blade.
			vec2 at = vShellAt.xz;
			float gust = sin( at.x * 0.9 + uTime * uWindSpeed ) + sin( at.y * 0.7 + uTime * uWindSpeed * 0.8 );
			at -= normalize( uWindDirection ) * gust * uWindStrength * vShell * vShell;
			// Two tilings of the blades, at odd scales and a turn apart, so neither repeats.
			vec4 bladeA = texture2D( uBlades, at / uBladeTile );
			vec4 bladeB = texture2D( uBlades, mat2( 0.8, -0.6, 0.6, 0.8 ) * at / ( uBladeTile * 1.37 ) + 0.31 );
			float blade = max( bladeA.r, bladeB.r );
			if ( blade * reach < vShell ) discard;
			float bladeShade = bladeA.r >= bladeB.r ? bladeA.g : bladeB.g;
			`
            )
            .replace(
                "#include <color_fragment>",
                /* glsl */ `
			#include <color_fragment>
			// The lawn's own colour here, as its floor has it — (x, -z) in metres
			// over the tile (StructureBuilder's slabs), placed as its texture is —
			// darker at the root.
			vec2 turfUv = ( uTurfTransform * vec3( vec2( vShellAt.x, -vShellAt.z ) / uTurfTile, 1.0 ) ).xy;
			vec3 turf = texture2D( uTurf, turfUv ).rgb;
			diffuseColor.rgb = turf * mix( 0.45, 1.15, vShell ) * mix( 0.85, 1.15, bladeShade );
			`
            )
            .replace(
                "#include <opaque_fragment>",
                /* glsl */ `
			${ground ? "outgoingLight = diffuseColor.rgb * vGroundLight;" : ""}
			#include <opaque_fragment>
			`
            );
    };
    material.customProgramCacheKey = () => cacheKey("lawn-shells", ground);
    return material;
}

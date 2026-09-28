// =============================================================================
//
//   The grass and foliage shaders are adapted from Fluffy Tree - Three.js
//   (https://github.com/leoawen/fluffytree-threejs): its wind, its grass's
//   colour from root to tip, its canopy's volumetric gradient and its
//   shadow darkening — here drawn on instanced tufts and generated crowns,
//   and lit to match the house's own light (see Vegetation.js).
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
 * What every grass and tree material shares, and Vegetation.js keeps up to
 * date: the time, for the wind; and the light, where it is not the scene's
 * own — the sun's direction and colour, and the sky's, as the bake has them
 * (Vegetation.setLight), and, in a baked view, the lawn's lightmap
 * (Vegetation.useGroundLight).
 */
export const uniforms = {
    uTime: { value: 0 },
    // The grass's wind: a swell across the lawn.
    uWindStrength: { value: 0.035 },
    uWindSpeed: { value: 1.2 },
    uWindDirection: { value: new THREE.Vector2(0.8, 0.6) },
    // The leaves': gusts of noise through the crown.
    uLeafWindStrength: { value: 0.05 },
    uLeafWindFrequency: { value: 1.2 },
    uLeafWindSpeed: { value: 0.4 },
    // Towards the sun, and its light and the sky's on what faces them.
    uSunDirection: { value: new THREE.Vector3(0.5, 0.7, 0.3).normalize() },
    uSunLight: { value: new THREE.Color(1, 1, 1) },
    uSkyLight: { value: new THREE.Color(0.4, 0.45, 0.5) },
    // How dark what is in the sun's shadow is drawn, of what the sun alone would light.
    uShadowDarkness: { value: 0.35 },
    // The lawn's lightmap, and how its light is opened out.
    uGroundLuma: { value: null },
    uGroundChroma: { value: null },
    uGroundScale: { value: 1 },
};

/** Grass from root to tip: a lawn's greens, a little yellower where the blades catch the light. */
export const GRASS = {
    base: new THREE.Color("#35561f"),
    tip: new THREE.Color("#6a9540"),
};

/** A crown's greens: in its own shade, in the light, and where the light is full on it. */
export const LEAVES = {
    shadow: new THREE.Color("#16301a"),
    lit: new THREE.Color("#4f7d2c"),
    highlight: new THREE.Color("#93b44f"),
    // Where along its shade-to-light the crown turns from shadow to lit, and to highlight.
    gradientStart: -1.0,
    gradientEnd: 1.6,
    highlightStart: 0.4,
    highlightEnd: 1.4,
};

/** Bark. */
export const BARK = new THREE.Color("#4d3d30");

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
	#if ( NUM_DIR_LIGHT_SHADOWS > 0 )
		sunShadow = getShadow(
			directionalShadowMap[ 0 ],
			directionalLightShadows[ 0 ].shadowMapSize,
			directionalLightShadows[ 0 ].shadowBias,
			directionalLightShadows[ 0 ].shadowRadius,
			vDirectionalShadowCoord[ 0 ]
		);
	#endif
`;

/**
 * Grass: instanced tufts, each two crossed cards of the tuft texture, their
 * roots on the lawn. The wind sways the tips and never the roots; the
 * colour runs from the root's green to the tip's.
 *
 * Lit two ways:
 *   - live, by the scene's lights like anything else (Lambert, on a blade
 *     facing up, so a tuft is lit as the lawn under it is), and darker in
 *     the sun's shadow;
 *   - baked (`ground`), by the light baked into the lawn at its root —
 *     the house's shadow, the trees' shade, the sky the house hides, day
 *     or night — read from the lawn's lightmap at the lightmap UV each tuft
 *     was given (`aGroundUv`, Vegetation.useGroundLight), so it and the
 *     lawn it stands on are lit as one. No light is worked out for it at
 *     all.
 *
 * @param {THREE.Texture} texture  the tuft, its shape in its alpha
 * @param {object} [ground]  baked: the lawn's lightmap's `{ encoding, storage }`
 */
export function grassMaterial(texture, ground = null) {
    const common = { map: texture, alphaTest: 0.5, side: THREE.DoubleSide };
    const material = ground ? new THREE.MeshBasicMaterial(common) : new THREE.MeshLambertMaterial(common);
    material.name = "grass";
    const decode = ground && (LIGHTMAP_DECODE[ground.encoding] ?? ((e) => e));
    const chroma = ground?.storage === "ycocg";
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = /* glsl */ `
			uniform float uTime;
			uniform float uWindStrength;
			uniform float uWindSpeed;
			uniform vec2 uWindDirection;
			attribute float aTint;
			varying float vHeight;
			varying float vTint;
			${
                ground
                    ? /* glsl */ `
			uniform sampler2D uGroundLuma;
			uniform sampler2D uGroundChroma;
			uniform float uGroundScale;
			attribute vec2 aGroundUv;
			varying vec3 vGroundLight;
			${chroma ? LIGHTMAP_YCOCG : ""}
			vec3 groundLight( vec2 uv ) {
				${chroma ? "vec3 e = ycocgColour( texture2D( uGroundLuma, uv ).r, texture2D( uGroundChroma, uv ).rg );" : "vec3 e = texture2D( uGroundLuma, uv ).rgb;"}
				return ${decode("e")} * uGroundScale;
			}`
                    : ""
            }
			${shader.vertexShader}
		`.replace(
            "#include <project_vertex>",
            /* glsl */ `
			vHeight = uv.y;
			vTint = aTint;
			vec4 mvPosition = vec4( transformed, 1.0 );
			#ifdef USE_INSTANCING
				mvPosition = instanceMatrix * mvPosition;
			#endif
			// The wind, across the lawn: the tips sway, the roots stay put.
			vec4 windAt = modelMatrix * mvPosition;
			float gust = sin( windAt.x * 0.5 + uTime * uWindSpeed ) + sin( windAt.z * 0.3 + uTime * uWindSpeed * 0.7 );
			mvPosition.xz += normalize( uWindDirection ) * gust * uWindStrength * vHeight * vHeight;
			mvPosition = modelViewMatrix * mvPosition;
			gl_Position = projectionMatrix * mvPosition;
			${ground ? "vGroundLight = groundLight( aGroundUv );" : ""}
			`
        );
        shader.fragmentShader = /* glsl */ `
			uniform float uShadowDarkness;
			uniform vec3 uBaseColor;
			uniform vec3 uTipColor;
			varying float vHeight;
			varying float vTint;
			${ground ? "varying vec3 vGroundLight;" : ""}
			${shader.fragmentShader}
		`
            .replace(
                "#include <normal_fragment_begin>",
                // Up, from either side of the card: its back is not lit as if it faced down.
                "#include <normal_fragment_begin>\n\tnormal = normalize( vNormal );"
            )
            .replace(
            "#include <opaque_fragment>",
            /* glsl */ `
			vec3 grassColour = mix( uBaseColor, uTipColor, vHeight ) * vTint;
			${
                ground
                    ? // The lawn's light; the tips, more open to the sky, a little more of it.
                      "outgoingLight = grassColour * vGroundLight * mix( 0.8, 1.2, vHeight );"
                    : `${SHADOW}
			outgoingLight = grassColour * outgoingLight * mix( uShadowDarkness, 1.0, sunShadow );`
            }
			#include <opaque_fragment>
			`
        );
        shader.uniforms.uBaseColor = { value: GRASS.base };
        shader.uniforms.uTipColor = { value: GRASS.tip };
    };
    material.customProgramCacheKey = () => `grass|${ground ? `${ground.encoding}|${chroma}` : "live"}`;
    return material;
}

/**
 * A tree's crown: cards of the leaf texture, gathered in clumps round the
 * branches' ends. Fluffy Tree's volumetric gradient colours each leaf by
 * which way it faces from the middle of the crown (`aCenter`), towards the
 * sun or away — so the whole crown is shaded as one soft mass, not card by
 * card — and gusts of noise stir it, the more the higher up (`aSway`).
 *
 * Its light is the sun's and the sky's (`uSunLight`, `uSkyLight`), as the
 * bake has them, whether the view is baked or not; live, the sun's shadow
 * darkens it too.
 */
export function canopyMaterial(texture) {
    const material = new THREE.MeshLambertMaterial({ alphaMap: texture, alphaTest: 0.5, side: THREE.DoubleSide });
    material.name = "leaves";
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms, {
            uShadowColor: { value: LEAVES.shadow },
            uLitColor: { value: LEAVES.lit },
            uHighlightColor: { value: LEAVES.highlight },
            uGradientStart: { value: LEAVES.gradientStart },
            uGradientEnd: { value: LEAVES.gradientEnd },
            uHighlightStart: { value: LEAVES.highlightStart },
            uHighlightEnd: { value: LEAVES.highlightEnd },
        });
        shader.vertexShader = /* glsl */ `
			uniform float uTime;
			uniform float uLeafWindStrength;
			uniform float uLeafWindFrequency;
			uniform float uLeafWindSpeed;
			attribute vec3 aCenter;
			attribute float aSway;
			varying vec3 vWorldPosition;
			varying vec3 vCenter;
			${NOISE}
			${shader.vertexShader}
		`.replace(
            "#include <begin_vertex>",
            /* glsl */ `
			#include <begin_vertex>
			// Gusts through the crown, stirring the top more than the bottom.
			vec3 local = position - aCenter;
			float gust = cnoise( vec3( local.x * uLeafWindFrequency, local.y * uLeafWindFrequency, uTime * uLeafWindSpeed + aCenter.x ) );
			transformed += normalize( vec3( 1.0, 0.0, 1.0 ) ) * gust * uLeafWindStrength * aSway;
			vWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
			vCenter = ( modelMatrix * vec4( aCenter, 1.0 ) ).xyz;
			`
        );
        shader.fragmentShader = /* glsl */ `
			uniform vec3 uSunDirection;
			uniform vec3 uSunLight;
			uniform vec3 uSkyLight;
			uniform float uShadowDarkness;
			uniform vec3 uShadowColor;
			uniform vec3 uLitColor;
			uniform vec3 uHighlightColor;
			uniform float uGradientStart;
			uniform float uGradientEnd;
			uniform float uHighlightStart;
			uniform float uHighlightEnd;
			varying vec3 vWorldPosition;
			varying vec3 vCenter;
			${shader.fragmentShader}
		`
            .replace(
                "#include <color_fragment>",
                /* glsl */ `
			#include <color_fragment>
			// Fluffy Tree's volumetric gradient: from the middle of the crown
			// out to this leaf, and how squarely that faces the sun.
			float towardsSun = dot( normalize( vWorldPosition - vCenter ), uSunDirection );
			vec3 leafColour = mix( uShadowColor, uLitColor, smoothstep( uGradientStart, uGradientEnd, towardsSun ) );
			leafColour = mix( leafColour, uHighlightColor, smoothstep( uHighlightStart, uHighlightEnd, towardsSun ) );
			diffuseColor.rgb = leafColour;
			`
            )
            .replace(
                "#include <opaque_fragment>",
                /* glsl */ `
			${SHADOW}
			outgoingLight = diffuseColor.rgb * ( uSkyLight + uSunLight * mix( uShadowDarkness, 1.0, sunShadow ) );
			#include <opaque_fragment>
			`
            );
    };
    material.customProgramCacheKey = () => "leaves";
    return material;
}

/** Bark: lit by the sun and the sky as the crown is, facing whichever way it faces. */
export function barkMaterial() {
    const material = new THREE.MeshLambertMaterial({ color: BARK });
    material.name = "bark";
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.fragmentShader = /* glsl */ `
			uniform vec3 uSunDirection;
			uniform vec3 uSunLight;
			uniform vec3 uSkyLight;
			uniform float uShadowDarkness;
			${shader.fragmentShader}
		`.replace(
            "#include <opaque_fragment>",
            /* glsl */ `
			${SHADOW}
			vec3 sunward = normalize( ( viewMatrix * vec4( uSunDirection, 0.0 ) ).xyz );
			float facing = max( dot( normal, sunward ), 0.0 );
			outgoingLight = diffuseColor.rgb * ( uSkyLight * ( 0.6 + 0.4 * normal.y ) + uSunLight * facing * mix( uShadowDarkness, 1.0, sunShadow ) );
			#include <opaque_fragment>
			`
        );
    };
    material.customProgramCacheKey = () => "bark";
    return material;
}

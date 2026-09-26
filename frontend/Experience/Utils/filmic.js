import * as THREE from "three";

import { FILMIC } from "./filmicCurve.js";

/**
 * Blender's Filmic view transform as three's custom tone mapping, so a
 * public view is drawn the way Blender shows the same light: the curve
 * sampled from Blender's colour management (blender/filmic_curve.py), one
 * per channel in log2 of the light, then handed on as linear, since three
 * encodes its output as sRGB after tone mapping and Filmic's values are
 * already sRGB display values.
 *
 * Once installed, `renderer.toneMapping = THREE.CustomToneMapping` draws
 * with it; exposure is `toneMappingExposure`, as for three's own.
 */
let installed = false;

const PLACEHOLDER = "vec3 CustomToneMapping( vec3 color ) { return color; }";

export function installFilmic() {
    if (installed) return;
    const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
    if (!chunk.includes(PLACEHOLDER)) throw new Error("three's custom tone mapping hook has changed");

    const curve = FILMIC.curve;
    const n = curve.length;
    const f = (v) => v.toFixed(6);
    // GLSL ES 1.00 — what a raw shader material, like the editor's output
    // pass, is compiled as — has no arrays to look a sample up in; there the
    // same interpolation is written out as the first sample plus a clamped
    // ramp for each segment, which comes to the same thing.
    const ramps = curve
        .slice(1)
        .map((v, i) => `\tv += ${f(v - curve[i])} * clamp( t - ${i.toFixed(1)}, 0.0, 1.0 );`)
        .join("\n");
    THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(
        PLACEHOLDER,
        /* glsl */ `
const float FILMIC_LOG_MIN = ${FILMIC.logMin.toFixed(9)};
const float FILMIC_STEP = ${f(FILMIC.step)};

#if __VERSION__ >= 300
const float FILMIC_CURVE[ ${n} ] = float[ ${n} ]( ${curve.map(f).join(", ")} );

float filmicSample( float t ) {
	int i = int( min( floor( t ), ${(n - 2).toFixed(1)} ) );
	return mix( FILMIC_CURVE[ i ], FILMIC_CURVE[ i + 1 ], t - float( i ) );
}

vec3 filmicCurve( vec3 t ) {
	return vec3( filmicSample( t.r ), filmicSample( t.g ), filmicSample( t.b ) );
}
#else
vec3 filmicCurve( vec3 t ) {
	vec3 v = vec3( ${f(curve[0])} );
${ramps}
	return v;
}
#endif

vec3 CustomToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	// Samples along: log2 of the light, from the curve's foot, in steps.
	vec3 t = clamp( ( log2( max( color, vec3( 1e-10 ) ) ) - FILMIC_LOG_MIN ) / FILMIC_STEP, 0.0, ${(n - 1).toFixed(1)} );
	vec3 display = filmicCurve( t );
	// Back to linear, for the sRGB encoding three applies next to undo.
	return mix( display / 12.92, pow( ( display + 0.055 ) / 1.055, vec3( 2.4 ) ), step( vec3( 0.04045 ), display ) );
}`
    );
    installed = true;
}

/**
 * How a baked lightmap is read back in a shader: shared by the view's own
 * materials (SceneBuilder's decodeLightmap) and whatever else takes its
 * light from the bake — the grass, from the lawn it grows on
 * (Vegetation/shaders.js).
 */

/** How a lightmap's light is opened back out, by encoding, from `e`. */
export const LIGHTMAP_DECODE = {
    // e = x / (1 + x), so x = e / (1 - e): up to 64 times the lightmap's
    // scale, the most it was encoded with.
    reinhard: (e) => `( ${e} / max( vec3( 1.0 ) - ${e}, vec3( 1.0 / 65.0 ) ) )`,
};

/**
 * Its colour put back together, for a lightmap stored "ycocg": the
 * brightness from the lightmap, two colour differences from the chroma
 * texture beside it (blender/bake_public.py's encode), then from sRGB, as
 * stored, back to linear.
 */
export const LIGHTMAP_YCOCG = /* glsl */ `
vec3 ycocgColour( float luma, vec2 chroma ) {
	vec2 c = chroma - 128.0 / 255.0;
	float t = luma - c.y;
	vec3 e = clamp( vec3( t + c.x, luma + c.y, t - c.x ), 0.0, 1.0 );
	return mix( e / 12.92, pow( ( e + 0.055 ) / 1.055, vec3( 2.4 ) ), step( vec3( 0.04045 ), e ) );
}
`;

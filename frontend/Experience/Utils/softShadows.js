import * as THREE from "three";

/**
 * Shadows soft as the sun draws them: sharp where the shade is near what
 * casts it — a chair's legs on the floor — and softer the further off —
 * a pergola's slats on the terrace, a roof's edge down a wall — since the
 * sun is a disc, not a point (percentage-closer soft shadows, after
 * Fernando, "Percentage-closer soft shadows", SIGGRAPH 2005).
 *
 * three's soft filter (PCFSoftShadowMap) is given a second way of
 * filtering: a light whose shadow `radius` is negative is filtered so, its
 * size the penumbra's width in the map's texture coordinates per unit of
 * the map's depth — (far − near) × 2 tan(the sun's angular radius) / the
 * width the map covers (Realism.js sets it as it fits the map to the
 * view). Every other shadow — a published view's sun, a lamp's — is drawn
 * as before. Patched into three's shader chunk once, before anything is
 * compiled.
 *
 *   1. Blockers: the depths in the map round the point, out to the widest
 *      penumbra there may be, nearer the sun than it — their average.
 *   2. The penumbra's width, from how far the point is behind them.
 *   3. The shade: that many taps of the map over a disc that wide, turned
 *      by a per-pixel angle so that the taps' pattern does not show.
 */
let installed = false;

export function installSoftShadows() {
    if (installed) return;
    const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
    const anchor = "float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord ) {";
    const test = "if ( frustumTest ) {";
    if (!chunk.includes(anchor) || !chunk.includes(test)) {
        console.warn("Soft sun shadows not installed: three's shadow chunk has changed");
        return;
    }
    installed = true;
    THREE.ShaderChunk.shadowmap_pars_fragment = chunk
        .replace(anchor, `${PCSS}\n\t${anchor}`)
        .replace(
            test,
            `${test}
			#if defined( SHADOWMAP_TYPE_PCF_SOFT )
				if ( shadowRadius < 0.0 ) return pcssShadow( shadowMap, shadowMapSize, - shadowRadius, shadowCoord );
			#endif`
        );
}

const PCSS = /* glsl */ `
	#if defined( SHADOWMAP_TYPE_PCF_SOFT )

		#define PCSS_BLOCKER_TAPS 16
		#define PCSS_FILTER_TAPS 28
		// The widest penumbra looked for, in texels.
		#define PCSS_MAX_TEXELS 22.0

		// A point of a disc of n, spread evenly (Vogel's spiral), turned by phi.
		vec2 pcssDisc( int i, int n, float phi ) {
			float r = sqrt( ( float( i ) + 0.5 ) / float( n ) );
			float theta = float( i ) * 2.39996323 + phi;
			return r * vec2( cos( theta ), sin( theta ) );
		}

		float pcssShadow( sampler2D shadowMap, vec2 shadowMapSize, float scale, vec4 coord ) {
			float texel = 1.0 / shadowMapSize.x;
			float receiver = coord.z;
			// Interleaved gradient noise (Jimenez 2014): a turn per pixel.
			float phi = 6.28318530 * fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );

			float search = clamp( receiver * scale, 2.0 * texel, PCSS_MAX_TEXELS * texel );
			float blockers = 0.0;
			float found = 0.0;
			for ( int i = 0; i < PCSS_BLOCKER_TAPS; i ++ ) {
				float depth = unpackRGBAToDepth( texture2D( shadowMap, coord.xy + pcssDisc( i, PCSS_BLOCKER_TAPS, phi ) * search ) );
				if ( depth < receiver ) {
					blockers += depth;
					found += 1.0;
				}
			}
			if ( found == 0.0 ) return 1.0;
			float blocker = blockers / found;

			float penumbra = clamp( ( receiver - blocker ) * scale, 1.25 * texel, search );
			float lit = 0.0;
			for ( int i = 0; i < PCSS_FILTER_TAPS; i ++ ) {
				vec2 offset = pcssDisc( i, PCSS_FILTER_TAPS, phi + 1.3 ) * penumbra;
				lit += step( receiver, unpackRGBAToDepth( texture2D( shadowMap, coord.xy + offset ) ) );
			}
			return lit / float( PCSS_FILTER_TAPS );
		}

	#endif
`;

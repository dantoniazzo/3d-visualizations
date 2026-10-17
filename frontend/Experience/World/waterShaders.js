import * as THREE from "three";

/**
 * What running water and a shower's steam are drawn with (World/Water.js):
 * seven small shaders of the app's own kind, each unlit — lit by one colour,
 * `uLight`, the light where the water is, worked out a few times a second
 * for the view as it is lit (Water.lightAt) — and none of them a lit
 * material of three's, whose shaders are built again for every lamp more
 * or less (Renderer.prepareLights) and pay for every lamp on every pixel,
 * and these pixels are drawn over and over.
 *
 *   - **stream**: a tap's water, an open tube from the spout down to the
 *     bowl, narrowing as it speeds up and swaying a little as it falls,
 *     its grain carried down at the water's own speed; drawn between
 *     `uTail` and `uHead`, so that it reaches the bowl as water would when
 *     the tap is opened, and leaves the spout last when it is shut;
 *   - **splash**: droplets thrown up where it lands, each on its own arc,
 *     worked out from the time alone (no state, nothing sent each frame);
 *   - **ripple**: the wet patch it lands on — under a tap, the thin, fast
 *     sheet that runs out from where the stream strikes to the broken ring
 *     where it piles up, slow ripples beyond and foam where it strikes;
 *     under a shower, a ring for each drop on the film of water over the
 *     tray;
 *   - **rain**: a shower head's drops, streaks as the eye sees them at
 *     their speed, from the head's nozzles to the tray — those that left
 *     the head since it was turned on, and none after it was turned off;
 *   - **haze**: the body of a hot shower's steam, a volume in a box — the
 *     enclosure's, and the room's over its top — that each pixel looks
 *     through and samples: gathering under the top and filling the
 *     enclosure from there down as it heats, a column of it off the falling
 *     water, spilling over the top into the room under its ceiling,
 *     clearing from the bottom up as it cools; wisps of a noise rising
 *     through it and turning about the water;
 *   - **steam**: its puffs, curls the eye can see move in it — the spray's
 *     mist off the tray, steam rising off the water, steam carried over the
 *     top and out — faded where they would meet a wall, the glass, the
 *     tray or the ceiling and where they come near the eye. Both worked out
 *     from the enclosure's box and the room's, not from the depth buffer,
 *     which no view keeps; both a veil that gives back more light than it
 *     hides (STEAM_VEIL, STEAM_GLOW);
 *   - **mist** on the glass: the condensation that creeps down a shower's
 *     panes and its door as the steam fills the enclosure from the top, an
 *     even, milky veil, beaded close to, with the odd run cut through it.
 *
 * Every one is drawn over what is behind it — transparent, writing no
 * depth, its colour premultiplied by how much it covers (One,
 * OneMinusSrcAlpha, as the cars' lamps are: Vehicle/CarLights.js), so that
 * the glint of a drop can add light where it covers nothing — in the
 * scene's haze, tone mapped and in the screen's colour space as everything
 * else is, and clipped by the editor's room focus.
 *
 * The particles are quads of one geometry for each kind, shared by every
 * fixture, as many as the quality step asks for (Utils/device.js's
 * `water`; made again larger if a step asks for more, drawn as far as the
 * step asks, drawRange): a quad's place is worked out in its vertex shader
 * from its `seed` and the time, so nothing is sent to the GPU as they move.
 * The haze is sampled as often as the step asks (`haze`).
 */

/** Gravity, in metres a second a second: what the water falls by. */
export const GRAVITY = 9.81;

/**
 * How steam is seen: of what is behind it, the share of its cover it hides
 * (VEIL), and the room's light it gives back for that cover (GLOW) — more
 * than it hides, so that it reads as a white veil over a dark wall and
 * still a haze over a pale one, never as a grey smoke: fine droplets
 * scatter the light they are in more than they stop it.
 */
const STEAM_VEIL = 0.75;
const STEAM_GLOW = 1.1;

/**
 * The water's noise, made once, in no file: `flat`, a tileable value noise
 * in two octaves (red coarse, green fine), what the water's surfaces are
 * grained with; and `layered`, the steam's — one random number a texel,
 * its green the red of the texel 37 across and 17 up, so that one read at a
 * cell's corner gives two neighbouring layers of a lattice that is stacked
 * that much askew, layer on layer: a noise in three dimensions for the
 * price of one read (the steam's noise3).
 */
let noiseTextures = null;
let noiseUsers = 0;

/** How many texels across the steam's noise is: its lattice repeats every so many cells (a few dozen metres). */
export const LAYERED_SIZE = 64;
/** ...and how far askew each layer is stacked on the one under it, in texels. */
const LAYER_SHIFT = [37, 17];

/** The noise textures, made the first time they are asked for and kept while anything uses them (releaseNoise). */
export function waterNoise() {
    noiseUsers++;
    if (!noiseTextures) noiseTextures = { flat: flatNoise(), layered: layeredNoise() };
    return noiseTextures;
}

/** The steam's noise: a random lattice, its layers stacked askew (waterNoise). */
function layeredNoise() {
    const size = LAYERED_SIZE;
    const lattice = new Uint8Array(size * size);
    let state = 97;
    for (let i = 0; i < lattice.length; i++) {
        state = (state * 1664525 + 1013904223) >>> 0;
        lattice[i] = state >>> 24;
    }
    const data = new Uint8Array(size * size * 2);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = y * size + x;
            data[i * 2] = lattice[i];
            data[i * 2 + 1] = lattice[((y + LAYER_SHIFT[1]) % size) * size + ((x + LAYER_SHIFT[0]) % size)];
        }
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGFormat, THREE.UnsignedByteType);
    texture.name = "steam-noise";
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    // Read between texels by its shader, eased (noise3): smoothly filtered, and never a smaller mip, which the
    // jump from one cell's corner to the next would ask for.
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
}

/** The water's surfaces' noise (waterNoise). */
function flatNoise() {
    const size = 128;
    const data = new Uint8Array(size * size * 2);
    const octave = (cells, seed) => {
        // A lattice of random values that wraps at the edge, smoothly interpolated: tileable.
        const lattice = new Float32Array(cells * cells);
        let state = seed;
        for (let i = 0; i < lattice.length; i++) {
            state = (state * 1664525 + 1013904223) >>> 0;
            lattice[i] = state / 4294967296;
        }
        const at = (x, y) => lattice[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)];
        const out = new Float32Array(size * size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const fx = (x / size) * cells;
                const fy = (y / size) * cells;
                const ix = Math.floor(fx);
                const iy = Math.floor(fy);
                const tx = smooth(fx - ix);
                const ty = smooth(fy - iy);
                const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
                const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
                out[y * size + x] = top + (bottom - top) * ty;
            }
        }
        return out;
    };
    const coarse = [octave(4, 11), octave(8, 23), octave(16, 37)];
    const fine = [octave(16, 51), octave(32, 67)];
    for (let i = 0; i < size * size; i++) {
        data[i * 2] = Math.round(255 * (coarse[0][i] * 0.5 + coarse[1][i] * 0.3 + coarse[2][i] * 0.2));
        data[i * 2 + 1] = Math.round(255 * (fine[0][i] * 0.6 + fine[1][i] * 0.4));
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGFormat, THREE.UnsignedByteType);
    texture.name = "water-noise";
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
}

/** One user of the noise textures done with them: let go of with the last. */
export function releaseNoise() {
    noiseUsers = Math.max(0, noiseUsers - 1);
    if (noiseUsers || !noiseTextures) return;
    noiseTextures.flat.dispose();
    noiseTextures.layered.dispose();
    noiseTextures = null;
}

/** An ease in and out over 0 to 1. */
function smooth(t) {
    return t * t * (3 - 2 * t);
}

// ----------------------------------------------------------------------
// Geometry
// ----------------------------------------------------------------------

/**
 * `count` quads, each its four corners (`position`: x and y ±1) and one
 * `seed` of four numbers in 0–1 for all four — what its shader places it
 * by. Seeded, so that every page draws the same drops.
 */
export function quadCloud(count, seed = 1) {
    const positions = new Float32Array(count * 4 * 3);
    const seeds = new Float32Array(count * 4 * 4);
    const index = new Uint32Array(count * 6);
    let state = seed >>> 0 || 1;
    const random = () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
    const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
    ];
    for (let q = 0; q < count; q++) {
        const s = [random(), random(), random(), random()];
        for (let c = 0; c < 4; c++) {
            const v = q * 4 + c;
            positions[v * 3] = corners[c][0];
            positions[v * 3 + 1] = corners[c][1];
            seeds.set(s, v * 4);
        }
        index.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 4));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    // (Placed by its shader: three's bounds would be of the corners. Its meshes are culled by Water itself.)
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    return geometry;
}

/** A tap's stream: an open tube of unit radius from y 0 (the spout) to y −1 (where it lands), shaped by its shader. */
export function streamGeometry() {
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 12, 18, true);
    geometry.translate(0, -0.5, 0);
    return geometry;
}

/** A flat square of side 2 lying on the floor (x and z ±1), sized by its shader: a ripple's. */
export function floorGeometry() {
    const geometry = new THREE.PlaneGeometry(2, 2);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
}

/** An upright square of side 1 facing +z: a pane's mist, sized and placed by its mesh's matrix. */
export function paneGeometry() {
    return new THREE.PlaneGeometry(1, 1);
}

/** A cube of side 1 about the origin: a box of steam, stretched to its corners by its shader (uBoxMin, uBoxMax). */
export function boxGeometry() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    // (Only its corners are used: no normals or uv to send.)
    geometry.deleteAttribute("normal");
    geometry.deleteAttribute("uv");
    return geometry;
}

// ----------------------------------------------------------------------
// Materials
// ----------------------------------------------------------------------

/** What every one of them starts and ends its vertex shader with: the haze's depth, the editor's clipping. */
const VERTEX_HEAD = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <clipping_planes_pars_vertex>
`;
const VERTEX_TAIL = /* glsl */ `
	#include <clipping_planes_vertex>
	#include <fog_vertex>
`;
const FRAGMENT_HEAD = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <clipping_planes_pars_fragment>
`;
/**
 * The colour and how much it covers, straight, as everything else ends:
 * tone mapped and into the screen's colour space where it is drawn to the
 * screen (three leaves both out where the view is drawn through its
 * passes, PostProcessing.js, which does them after), in the haze, and then
 * premultiplied for the blending.
 */
const FRAGMENT_TAIL = /* glsl */ `
	gl_FragColor = vec4( colour, alpha );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	gl_FragColor.rgb *= gl_FragColor.a;
`;

/** A hash of a number to 0–1. */
const HASH = /* glsl */ `
float hash11( float n ) {
	return fract( sin( mod( n, 6283.0 ) * 12.9898 ) * 43758.5453 );
}
float hash21( vec2 p ) {
	return fract( sin( dot( mod( p, 6283.0 ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
}
`;

/**
 * A material of the kind the module's comment says — two-sided, a quad
 * turned to face the eye being wound either way round — with its own
 * `uniforms`, the `shared` ones (the clock, the noise, a pixel's size)
 * passed in as they are, the same objects in every material, so that one
 * change is every material's.
 */
function material(name, uniforms, vertexShader, fragmentShader, { side = THREE.DoubleSide } = {}) {
    return new THREE.ShaderMaterial({
        name,
        uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...uniforms },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        side,
        fog: true,
        clipping: true,
    });
}

// --- the stream -------------------------------------------------------

const STREAM_VERTEX = /* glsl */ `
${VERTEX_HEAD}
uniform float uTime;
uniform float uFall;
uniform float uR0;
uniform float uV0;
uniform float uFlow;
uniform float uSeed;
varying float vS;
varying float vAge;
varying float vAround;
varying vec3 vNormal;
varying vec3 vView;
void main() {
	// How far down it is, 0 at the spout to 1 where it lands, and how fast the water is going there.
	float s = clamp( - position.y, 0.0, 1.0 );
	float d = s * uFall;
	float v = sqrt( uV0 * uV0 + 2.0 * ${GRAVITY.toFixed(2)} * d );
	// How long the water here has been falling: what its grain is carried down by.
	vAge = ( v - uV0 ) / ${GRAVITY.toFixed(2)};
	// As thick as it can be where the water is slow, thinner as it speeds up — as much water a second through
	// less of it, though an aerated stream, its air in it, necks less than a clear one would — and thinner
	// still while the lever is only part open.
	float r = uR0 * pow( uV0 / v, 0.3 ) * mix( 0.4, 1.0, uFlow );
	// Never a rod: a sway that grows as it falls, running down it.
	float sway = 0.0011 * s * ( 0.5 + 0.5 * uFlow );
	vec2 off = sway * vec2( sin( uTime * 9.0 - vAge * 42.0 + uSeed ), cos( uTime * 7.3 - vAge * 35.0 + uSeed * 1.7 ) );
	vec3 p = vec3( position.x * r + off.x, - d, position.z * r + off.y );
	vS = s;
	vAround = atan( position.z, position.x );
	vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 );
	vNormal = normalize( normalMatrix * vec3( position.x, 0.0, position.z ) );
	vView = - mvPosition.xyz;
	gl_Position = projectionMatrix * mvPosition;
${VERTEX_TAIL}
}
`;

const STREAM_FRAGMENT = /* glsl */ `
${FRAGMENT_HEAD}
uniform float uTime;
uniform float uFlow;
uniform float uHead;
uniform float uTail;
uniform float uSeed;
uniform vec3 uLight;
uniform sampler2D uNoise;
varying float vS;
varying float vAge;
varying float vAround;
varying vec3 vNormal;
varying vec3 vView;
void main() {
	#include <clipping_planes_fragment>
	// Only the water that has left the spout since it was opened, and not yet all fallen since it was shut.
	if ( vS > uHead || vS < uTail ) discard;
	vec3 n = normalize( vNormal );
	vec3 e = normalize( vView );
	float facing = abs( dot( n, e ) );
	float rim = pow( 1.0 - facing, 1.5 );
	// The aerator's bubbles, carried down with the water that holds them: read where that water was as it left.
	float grain = texture2D( uNoise, vec2( vAround * 0.3183 + uSeed, ( uTime - vAge ) * 2.2 ) ).g;
	float streak = smoothstep( 0.55, 0.9, grain );
	// The light it catches: a line down one side, as off a glass rod, broken by the bubbles, and a fainter one
	// down the other.
	float glint = exp( - pow( ( n.x - 0.5 ) * 5.0, 2.0 ) ) * ( 0.7 + 0.6 * grain ) + 0.3 * exp( - pow( ( n.x + 0.65 ) * 7.0, 2.0 ) );
	// Its leading end, a little fuller, while it is still on its way down.
	float front = uHead < 1.0 ? 1.0 - smoothstep( 0.0, 0.05, uHead - vS ) : 0.0;
	// Seen through, water bends the room behind it: its edges darker than what is behind them, its middle all
	// but clear — and it shines where it catches the light, down its side and in its bubbles.
	float body = 0.2 + 0.55 * rim + 0.2 * front;
	float shine = clamp( 0.85 * glint + 0.45 * streak, 0.0, 1.0 );
	float alpha = uFlow * clamp( body + 0.6 * shine, 0.0, 0.92 );
	vec3 dark = uLight * vec3( 0.34, 0.38, 0.42 );
	vec3 bright = uLight * vec3( 1.9, 1.95, 2.0 );
	vec3 colour = mix( dark, bright, shine / max( shine + body, 1e-3 ) );
${FRAGMENT_TAIL}
}
`;

/**
 * A tap's stream (the class's comment). `light` is its fixture's light, shared with the splash and the ripple.
 *
 * @param {object} shared  `{ uTime, uNoise }`
 * @param {{ value: THREE.Color }} light
 */
export function streamMaterial(shared, light) {
    return material(
        "water_stream",
        {
            uTime: shared.uTime,
            uNoise: shared.uNoise,
            uLight: light,
            uFall: { value: 0.2 },
            uR0: { value: 0.008 },
            uV0: { value: 0.6 },
            uFlow: { value: 0 },
            uHead: { value: 0 },
            uTail: { value: 0 },
            uSeed: { value: 0 },
        },
        STREAM_VERTEX,
        STREAM_FRAGMENT,
        // (A tube seen from outside: its near half, the far one behind it would double what is seen through.)
        { side: THREE.FrontSide }
    );
}

// --- the splash -------------------------------------------------------

const SPLASH_VERTEX = /* glsl */ `
${VERTEX_HEAD}
${HASH}
attribute vec4 seed;
uniform float uTime;
uniform float uFloor;
uniform vec2 uArea;
uniform float uSpeed;
uniform float uSize;
uniform float uLanding;
uniform float uSeed;
uniform float uPixel;
varying vec2 vCorner;
varying float vFade;
void main() {
	// Each droplet a short arc out of where the water lands, and another after it, for ever.
	float life = mix( 0.2, 0.42, seed.x );
	float t = uTime + ( seed.y + uSeed ) * life;
	float age = fract( t / life );
	float tau = age * life;
	float k = floor( t / life ) + seed.w * 97.0;
	// Thrown from a point of where it lands (each arc its own), out and up.
	vec2 from = ( vec2( hash11( k * 1.7 + 3.1 ), hash11( k * 2.3 + 7.9 ) ) - 0.5 ) * 2.0 * uArea;
	float way = ( seed.z + hash11( k * 0.37 ) ) * 6.2832;
	float out_ = mix( 0.12, 0.55, hash11( k * 5.1 + 1.3 ) ) * uSpeed;
	float up = mix( 0.3, 1.0, hash11( k * 3.7 + 9.2 ) ) * uSpeed;
	vec3 p = vec3( from.x + cos( way ) * out_ * tau, uFloor + up * tau - 0.5 * ${GRAVITY.toFixed(2)} * tau * tau, from.y + sin( way ) * out_ * tau );
	// Back below where it came from: gone.
	vFade = uLanding * ( 1.0 - age * age ) * step( uFloor - 0.003, p.y );
	vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 );
	// No smaller than about a pixel: a droplet a fraction of one sparkles on and off as it moves.
	float size = uSize * mix( 0.6, 1.25, seed.x );
	float least = uPixel * - mvPosition.z * 0.8;
	vFade *= min( 1.0, size / max( least, 1e-6 ) );
	size = max( size, least );
	mvPosition.xy += position.xy * size;
	vCorner = position.xy;
	gl_Position = vFade > 0.001 ? projectionMatrix * mvPosition : vec4( 2.0, 2.0, 2.0, 1.0 );
${VERTEX_TAIL}
}
`;

const SPLASH_FRAGMENT = /* glsl */ `
${FRAGMENT_HEAD}
uniform vec3 uLight;
varying vec2 vCorner;
varying float vFade;
void main() {
	#include <clipping_planes_fragment>
	float r2 = dot( vCorner, vCorner );
	if ( r2 > 1.0 ) discard;
	float alpha = ( 1.0 - r2 ) * vFade * 0.8;
	// A droplet catches the light: brighter than the stream it came from, and whiter (the rain's rule).
	vec3 colour = mix( vec3( dot( uLight, vec3( 0.2126, 0.7152, 0.0722 ) ) ), uLight, 0.6 ) * 1.45;
${FRAGMENT_TAIL}
}
`;

/** Droplets thrown up where the water lands (the class's comment). */
export function splashMaterial(shared, light) {
    return material(
        "water_splash",
        {
            uTime: shared.uTime,
            uPixel: shared.uPixel,
            uLight: light,
            uFloor: { value: -0.2 },
            uArea: { value: new THREE.Vector2(0.004, 0.004) },
            uSpeed: { value: 1 },
            uSize: { value: 0.0018 },
            uLanding: { value: 0 },
            uSeed: { value: 0 },
        },
        SPLASH_VERTEX,
        SPLASH_FRAGMENT
    );
}

// --- the ripple -------------------------------------------------------

const RIPPLE_VERTEX = /* glsl */ `
${VERTEX_HEAD}
uniform float uFloor;
uniform vec2 uHalf;
varying vec2 vAt;
void main() {
	vAt = position.xz * uHalf;
	vec4 mvPosition = modelViewMatrix * vec4( position.x * uHalf.x, uFloor, position.z * uHalf.y, 1.0 );
	gl_Position = projectionMatrix * mvPosition;
${VERTEX_TAIL}
}
`;

const RIPPLE_FRAGMENT = /* glsl */ `
${FRAGMENT_HEAD}
${HASH}
uniform float uTime;
uniform vec2 uHalf;
uniform float uWet;
uniform float uRain;
uniform float uImpact;
uniform float uJump;
uniform float uSeed;
uniform vec3 uLight;
uniform sampler2D uNoise;
varying vec2 vAt;
/** Rings from drops landing at random in cells of \`cell\` metres: how much of a ring's crest is here. */
float rainRings( vec2 p, float cell, float speed, float offset ) {
	vec2 q = p / cell + offset;
	vec2 id = floor( q );
	vec2 f = fract( q ) - 0.5;
	float crest = 0.0;
	for ( int j = -1; j <= 1; j++ ) {
		for ( int i = -1; i <= 1; i++ ) {
			vec2 o = vec2( float( i ), float( j ) );
			vec2 c = id + o;
			float h = hash21( c + uSeed );
			float phase = fract( uTime * speed + h );
			vec2 at = o + ( vec2( hash21( c * 1.7 + 3.3 ), hash21( c * 2.9 + 1.1 ) ) - 0.5 ) * 0.8;
			float d = length( f - at );
			float radius = phase * 0.9;
			crest += ( 1.0 - smoothstep( 0.0, 0.07, abs( d - radius ) ) ) * ( 1.0 - phase ) * ( 1.0 - phase );
		}
	}
	return crest;
}
void main() {
	#include <clipping_planes_fragment>
	vec2 p = vAt;
	// Shaped as the patch of water is: oval to its half sizes, soft at its edge, ragged.
	float n = texture2D( uNoise, p * 4.0 + uSeed ).r;
	float r = length( p / uHalf ) + ( n - 0.5 ) * 0.35;
	float edge = 1.0 - smoothstep( 0.55, 1.0, r );
	float d = length( p );
	float crest = 0.0;
	float foam = 0.0;
	if ( uRain < 0.5 ) {
		// A tap's stream strikes the floor and runs out from it in a thin, fast sheet, streaked as it goes, to
		// where it slows and piles up all at once in a broken ring (the jump); beyond that, slow water rippling
		// out and away. Where it strikes, its foam.
		float way = atan( p.y, p.x );
		float jump = uJump * ( 1.0 + 0.36 * ( texture2D( uNoise, vec2( way * 0.32 + uSeed, uTime * 0.6 ) ).r - 0.5 ) );
		float sheet = 1.0 - smoothstep( jump * 0.85, jump, d );
		float streaks = smoothstep( 0.55, 0.85, texture2D( uNoise, vec2( way * 1.9 + uSeed, d * 9.0 - uTime * 6.0 ) ).g );
		float ring = exp( - pow( ( d - jump ) / ( 0.003 + jump * 0.12 ), 2.0 ) ) * ( 0.55 + 0.45 * texture2D( uNoise, vec2( way * 3.0, uTime * 2.0 ) ).g );
		float slow = ( 0.5 + 0.5 * sin( d * 150.0 - uTime * 8.0 + n * 4.0 ) ) * exp( - max( d - jump, 0.0 ) * 20.0 ) * ( 1.0 - sheet );
		crest = sheet * streaks * 0.6 + ring * 0.7 + slow * 0.25;
		foam = exp( - d * d / max( uImpact * uImpact, 1e-6 ) ) * ( 0.5 + 0.5 * texture2D( uNoise, p * 40.0 + vec2( uTime * 3.0, 0.0 ) ).g );
	} else {
		// The shower's: a ring for each drop, on the film of water over the tray.
		crest = ( rainRings( p, 0.045, 1.9, 0.0 ) + rainRings( p, 0.07, 1.3, 0.37 ) ) * 0.7;
	}
	float alpha = uWet * edge * clamp( 0.14 + 0.3 * crest + 0.5 * foam, 0.0, 0.9 );
	// A wet film is darker than the dry surface, its crests and foam bright.
	vec3 colour = uLight * ( 0.3 + 1.4 * crest + 1.0 * foam );
${FRAGMENT_TAIL}
}
`;

/** The wet patch the water lands on (the class's comment). */
export function rippleMaterial(shared, light) {
    return material(
        "water_ripple",
        {
            uTime: shared.uTime,
            uNoise: shared.uNoise,
            uLight: light,
            uFloor: { value: -0.2 },
            uHalf: { value: new THREE.Vector2(0.06, 0.06) },
            uWet: { value: 0 },
            uRain: { value: 0 },
            uImpact: { value: 0.012 },
            uJump: { value: 0.03 },
            uSeed: { value: 0 },
        },
        RIPPLE_VERTEX,
        RIPPLE_FRAGMENT
    );
}

// --- the rain ---------------------------------------------------------

const RAIN_VERTEX = /* glsl */ `
${VERTEX_HEAD}
${HASH}
attribute vec4 seed;
uniform float uTime;
uniform float uFall;
uniform float uV0;
uniform float uFallTime;
uniform float uRound;
uniform vec2 uHead;
uniform float uSinceOn;
uniform float uSinceOff;
uniform float uFlow;
uniform vec4 uBlock;
uniform float uPixel;
uniform float uSeed;
varying vec2 vCorner;
varying float vAlpha;
void main() {
	// Each quad a drop from one nozzle, and the next drop from it once that one has landed, for ever.
	float time = uFallTime * mix( 0.92, 1.08, seed.z );
	float t = uTime + ( seed.w + uSeed ) * time;
	float age = fract( t / time );
	float tau = age * time;
	float k = floor( t / time );
	// Its nozzle: anywhere on a round head, or a square one.
	vec2 at;
	if ( uRound > 0.5 ) {
		float a = seed.x * 6.2832;
		at = vec2( cos( a ), sin( a ) ) * sqrt( seed.y ) * uHead.x;
	} else {
		at = ( seed.xy - 0.5 ) * uHead;
	}
	// Aimed a few degrees out, and each drop a little off the last.
	vec2 jitter = ( vec2( hash11( k * 1.31 + seed.x * 17.0 ), hash11( k * 2.17 + seed.y * 23.0 ) ) - 0.5 ) * 0.016;
	vec2 xz = at * ( 1.0 + 0.4 * tau ) + jitter * ( 0.3 + tau );
	float y = - ( uV0 * tau + 0.5 * ${GRAVITY.toFixed(2)} * tau * tau );
	float v = uV0 + ${GRAVITY.toFixed(2)} * tau;
	// As long as the eye sees a drop go by at its speed: a streak, longer as it falls faster.
	float len = clamp( v * 0.026, 0.03, 0.16 );
	// Left the head since it was turned on, and before it was turned off; not landed yet.
	float shown = step( tau, uSinceOn ) * step( uSinceOff, tau ) * step( - uFall, y );
	// On whoever stands under it, it ends on them (their head and shoulders): not through them.
	if ( uBlock.z > 0.0 && distance( xz, uBlock.xy ) < uBlock.z && y < uBlock.w ) shown = 0.0;
	vec3 head = vec3( xz.x, y, xz.y );
	vec4 mvPosition = modelViewMatrix * vec4( head + vec3( 0.0, len * 0.5, 0.0 ), 1.0 );
	// Turned about its own length to face the eye.
	vec3 axis = normalize( ( modelViewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
	vec3 side = normalize( cross( normalize( mvPosition.xyz ), axis ) );
	float width = 0.0016 * mix( 0.75, 1.3, seed.z );
	// No narrower than a pixel or so, and as much fainter: a thinner streak flickers in and out of the pixels.
	float least = uPixel * - mvPosition.z * 1.1;
	float wide = max( width, least );
	mvPosition.xyz += side * position.x * wide + axis * position.y * len * 0.5;
	vCorner = position.xy;
	vAlpha = shown * uFlow * ( width / wide ) * mix( 0.45, 0.8, seed.y );
	gl_Position = vAlpha > 0.001 ? projectionMatrix * mvPosition : vec4( 2.0, 2.0, 2.0, 1.0 );
${VERTEX_TAIL}
}
`;

const RAIN_FRAGMENT = /* glsl */ `
${FRAGMENT_HEAD}
uniform vec3 uLight;
varying vec2 vCorner;
varying float vAlpha;
void main() {
	#include <clipping_planes_fragment>
	// Round across, fading towards its tail; its lower end, where the drop is, the brightest.
	float across = 1.0 - vCorner.x * vCorner.x;
	float along = 1.0 - smoothstep( -0.2, 1.0, vCorner.y );
	float alpha = vAlpha * across * along;
	if ( alpha < 0.002 ) discard;
	// A falling drop shows the brightest light round it, a window's or a lamp's, more than the room's tint: whiter
	// than the walls it passes.
	vec3 colour = mix( vec3( dot( uLight, vec3( 0.2126, 0.7152, 0.0722 ) ) ), uLight, 0.6 ) * ( 1.25 + 0.75 * along );
${FRAGMENT_TAIL}
}
`;

/** A shower head's drops (the class's comment). */
export function rainMaterial(shared, light) {
    return material(
        "water_rain",
        {
            uTime: shared.uTime,
            uPixel: shared.uPixel,
            uLight: light,
            uFall: { value: 2 },
            uV0: { value: 1.6 },
            uFallTime: { value: 0.5 },
            uRound: { value: 1 },
            uHead: { value: new THREE.Vector2(0.1, 0.1) },
            uSinceOn: { value: 0 },
            uSinceOff: { value: -1 },
            uFlow: { value: 0 },
            uBlock: { value: new THREE.Vector4(0, 0, 0, 0) },
            uSeed: { value: 0 },
        },
        RAIN_VERTEX,
        RAIN_FRAGMENT
    );
}

// --- the steam --------------------------------------------------------

const STEAM_VERTEX = /* glsl */ `
${VERTEX_HEAD}
${HASH}
attribute vec4 seed;
uniform float uTime;
uniform vec3 uHalf;
uniform vec4 uSource;
uniform vec4 uRoom;
uniform float uCeiling;
uniform float uHeat;
uniform float uRunning;
uniform vec3 uEye;
varying vec2 vCorner;
varying vec3 vLocal;
varying float vAlpha;
varying float vDepth;
varying vec2 vShift;
void main() {
	// In the enclosure's own frame: its middle at the origin, its box ±uHalf. Each puff a curl of what the
	// steam's body (the haze) is a mass of, for the eye to see it move: three kinds, by seed.z — a third the
	// spray's mist off the tray where the water lands (short-lived, low, there as soon as the water runs); two
	// fifths steam rising off the falling water to the top; the rest steam carried up over the top and out
	// into the room, as far as it has spread there.
	float spray = step( seed.z, 0.3 );
	float spill = step( 0.7, seed.z );
	float life = spray > 0.5 ? mix( 1.6, 3.0, seed.x ) : spill > 0.5 ? mix( 6.0, 10.0, seed.x ) : mix( 4.0, 7.0, seed.x );
	float t = uTime + seed.y * life;
	float age = fract( t / life );
	float k = floor( t / life ) + seed.z * 31.0;
	// A fresh place each life.
	vec3 born = vec3( hash11( k * 1.13 + 0.7 ), hash11( k * 0.61 + 2.9 ), hash11( k * 2.71 + 5.3 ) );
	float top = uHalf.y;
	float spread = 0.08 + 0.9 * smoothstep( 0.2, 1.0, uHeat );
	vec3 p;
	float size;
	if ( spray > 0.5 ) {
		p = vec3( uSource.x + ( born.x - 0.5 ) * 2.4 * uSource.z, - uHalf.y + 0.05 + 0.35 * pow( age, 0.7 ) * mix( 0.6, 1.4, born.y ), uSource.y + ( born.z - 0.5 ) * 2.4 * uSource.w );
		size = mix( 0.1, 0.3, age );
	} else if ( spill > 0.5 ) {
		// From under the top, up over it and away from the enclosure's middle.
		vec2 from = ( born.xz - 0.5 ) * 1.6 * uHalf.xz;
		vec2 way = normalize( from + ( born.zx - 0.5 ) * 0.4 + vec2( 1e-3, 0.0 ) );
		p = vec3( from.x, top - 0.15 + mix( 0.2, 0.5, born.y ) * smoothstep( 0.0, 0.6, age ) + 0.15 * age, from.y );
		p.xz += way * smoothstep( 0.15, 1.0, age ) * spread;
		size = mix( 0.22, 0.6, age );
	} else {
		// Off the falling water, 0.3–1.2 m over the tray, up to the top, slower as it cools.
		p = vec3( uSource.x + ( born.x - 0.5 ) * 2.0 * uSource.z, - uHalf.y + mix( 0.3, 1.2, born.y ), uSource.y + ( born.z - 0.5 ) * 2.0 * uSource.w );
		p.y += pow( age, 0.8 ) * ( top - 0.05 - p.y );
		size = mix( 0.12, 0.42, age );
	}
	// Eddying: sums of sines of where it is and when, which turn it about as a curl of air would.
	float w = uTime * 0.23 + seed.w * 10.0;
	p.x += ( sin( p.y * 2.1 + w ) + 0.5 * sin( p.z * 3.3 - w * 1.3 ) ) * 0.08 * ( 0.3 + age );
	p.z += ( cos( p.y * 1.7 - w * 0.8 ) + 0.5 * sin( p.x * 2.9 + w ) ) * 0.08 * ( 0.3 + age );
	// Under the top, held in the enclosure; over it, in the room's plan round it (uRoom) and under its ceiling.
	float over = smoothstep( top - 0.05, top + 0.1, p.y );
	vec2 held = clamp( p.xz, - uHalf.xz + size * 0.4, uHalf.xz - size * 0.4 );
	vec2 room = clamp( p.xz, uRoom.xz + size * 0.4, uRoom.yw - size * 0.4 );
	p.xz = mix( held, room, over );
	p.y = min( p.y, uCeiling - size * 0.4 );
	float alpha;
	if ( spray > 0.5 ) {
		// (Faint, and many of them at once: a mist about the tray, never a ball of it.)
		alpha = smoothstep( 0.0, 0.25, age ) * ( 1.0 - smoothstep( 0.4, 1.0, age ) ) * uRunning * 0.22;
	} else if ( spill > 0.5 ) {
		// Once the steam is thick enough under the top to spill, and as long as it is.
		alpha = smoothstep( 0.0, 0.2, age ) * ( 1.0 - smoothstep( 0.55, 1.0, age ) ) * smoothstep( 0.25, 0.8, uHeat ) * 0.3;
	} else {
		// Born while the hot water runs, more of them the hotter it is; as each grows it thins (as much steam, spread
		// wider).
		alpha = smoothstep( seed.x - 0.3, seed.x, uHeat * 1.3 ) * uRunning * smoothstep( 0.0, 0.14, age ) * ( 1.0 - smoothstep( 0.6, 1.0, age ) ) * mix( 0.6, 0.3, age );
	}
	// None up against the eye: faded out, then shrunk away to nothing (no sheet over the whole screen, nor its cost;
	// the steam's body is about the eye there).
	float eye = distance( uEye, p );
	alpha *= smoothstep( size * 0.6 + 0.2, size + 0.9, eye );
	// Turned to face the eye.
	vec3 toEye = normalize( uEye - p );
	vec3 right = normalize( abs( toEye.y ) > 0.98 ? cross( vec3( 1.0, 0.0, 0.0 ), toEye ) : cross( vec3( 0.0, 1.0, 0.0 ), toEye ) );
	vec3 up = cross( toEye, right );
	vec3 corner = p + ( right * position.x + up * position.y ) * size;
	vLocal = corner;
	vCorner = position.xy;
	vAlpha = alpha;
	vShift = vec2( hash11( seed.z * 13.0 + k ), hash11( seed.w * 7.0 + k ) );
	vec4 mvPosition = modelViewMatrix * vec4( corner, 1.0 );
	vDepth = - mvPosition.z;
	gl_Position = alpha > 0.002 ? projectionMatrix * mvPosition : vec4( 2.0, 2.0, 2.0, 1.0 );
${VERTEX_TAIL}
}
`;

const STEAM_FRAGMENT = /* glsl */ `
${FRAGMENT_HEAD}
uniform float uTime;
uniform vec3 uHalf;
uniform vec4 uRoom;
uniform float uCeiling;
uniform float uOpacity;
uniform vec3 uLight;
uniform sampler2D uNoise;
varying vec2 vCorner;
varying vec3 vLocal;
varying float vAlpha;
varying float vDepth;
varying vec2 vShift;
void main() {
	#include <clipping_planes_fragment>
	float r2 = dot( vCorner, vCorner );
	if ( r2 > 1.0 ) discard;
	// Soft all the way out: a puff's edge is never seen.
	float disc = 1.0 - r2;
	disc *= disc * disc;
	// Wisps, not discs: the noise where it is, drifting up through it — its coarse and its fine octave in one read.
	vec3 q = vLocal;
	vec2 tex = texture2D( uNoise, ( q.xy + q.zy * 0.5 ) * 0.8 + vShift + vec2( 0.0, - uTime * 0.06 ) ).rg;
	float n = tex.r * 0.65 + tex.g * 0.35;
	float wisp = mix( 0.4, 1.0, smoothstep( 0.2, 0.8, n ) );
	// Soft where it would meet what bounds it: the enclosure's walls, glass and tray, under its top; over
	// it, the room's walls and ceiling. (Its box, and the room over its top, as one space: the farther
	// inside either.)
	float box = min( min( uHalf.x - abs( q.x ), uHalf.z - abs( q.z ) ), q.y + uHalf.y );
	float room = min( min( min( q.x - uRoom.x, uRoom.y - q.x ), min( q.z - uRoom.z, uRoom.w - q.z ) ), uCeiling - q.y );
	float inside = max( min( box, room ), min( room, q.y - uHalf.y ) );
	float density = vAlpha * disc * wisp * smoothstep( 0.0, 0.14, inside ) * smoothstep( 0.12, 0.6, vDepth ) * uOpacity;
	if ( density < 0.003 ) discard;
	// Seen as the steam's body is (STEAM_VEIL, STEAM_GLOW): a veil, never a smoke.
	float alpha = density * ${STEAM_VEIL.toFixed(2)};
	float grey = dot( uLight, vec3( 0.2126, 0.7152, 0.0722 ) );
	vec3 colour = mix( vec3( grey ), uLight, 0.8 ) * mix( 0.9, 1.15, n ) * ${(STEAM_GLOW / STEAM_VEIL).toFixed(3)};
${FRAGMENT_TAIL}
}
`;

/** A hot shower's steam (the class's comment), its own light. */
export function steamMaterial(shared, light) {
    return material(
        "steam",
        {
            uTime: shared.uTime,
            uNoise: shared.uNoise,
            uLight: light,
            uHalf: { value: new THREE.Vector3(0.5, 1, 0.5) },
            uSource: { value: new THREE.Vector4(0, 0, 0.15, 0.15) },
            uRoom: { value: new THREE.Vector4(-1, 1, -1, 1) },
            uCeiling: { value: 1.75 },
            uHeat: { value: 0 },
            uRunning: { value: 0 },
            uEye: { value: new THREE.Vector3() },
            uOpacity: { value: 0.14 },
        },
        STEAM_VERTEX,
        STEAM_FRAGMENT
    );
}

// --- the steam's body, a volume ------------------------------------------

/** The most samples a look through the steam's box takes (the step's `haze` asks for as many or fewer)... */
export const HAZE_STEPS = 12;
/** ...and the least distance between two, in metres: a shorter look takes fewer (at least two). */
const HAZE_SPACING = 0.3;

/**
 * What a box of steam is drawn with: its corners, in the enclosure's own
 * frame, stretched from the cube's (boxGeometry).
 */
const HAZE_VERTEX = /* glsl */ `
${VERTEX_HEAD}
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
varying vec3 vLocal;
void main() {
	vLocal = mix( uBoxMin, uBoxMax, position + 0.5 );
	vec4 mvPosition = modelViewMatrix * vec4( vLocal, 1.0 );
	gl_Position = projectionMatrix * mvPosition;
${VERTEX_TAIL}
}
`;

/**
 * The steam's body: for each pixel of its box, the look from the eye
 * through the box sampled a few times (uSteps along a long look, fewer
 * along a short one; jittered from pixel to pixel so that too few samples
 * read as a fine grain rather than as bands), the steam's thickness at
 * each — how much of what is behind it it hides, and as much of the
 * room's light as that it gives back.
 *
 * Where it is: hot, moist air rises, so the steam gathers under the
 * enclosure's top and fills it from there down as the shower heats, and,
 * once the water stops and it cools, clears from the bottom up (uLayer:
 * where the layer's lower edge begins and ends, as shares of the height,
 * and how thick it is now); while the hot water runs, a column of it rises
 * off the falling water (uColumn: how thick at its middle now); over the
 * top it spills out into the room (uSpill: the room's plan round the
 * enclosure; uCeiling), further the longer the shower has run (uSpread:
 * how far it has spread, and how thick it is over the top), thinning as it
 * spreads and gathering under the ceiling. Water.dressSteam works these
 * out from the heat once a frame, not every sample of every pixel. Soft
 * where it meets the walls, the glass, the tray and the ceiling, worked
 * out from its boxes — no view keeps a depth buffer to fade against.
 * Wisps: a noise in three dimensions (noise3) rising through it
 * and turning slowly about the water, its finer octave quicker and the
 * other way (uSwirl: each octave's turn now, cosine and sine), so that
 * nothing slides or stretches however long it runs.
 *
 * What it does not know is how far the solid things inside its box are: a
 * valve, a shelf, the visitor in it are veiled as the wall behind them is,
 * by the steam behind them as well as in front — a few tenths of a metre of
 * it, where the box is a metre deep.
 */
const HAZE_FRAGMENT = /* glsl */ `
${FRAGMENT_HEAD}
uniform float uTime;
uniform sampler2D uNoise3;
uniform vec3 uLight;
uniform vec3 uHalf;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform vec4 uSpill;
uniform float uCeiling;
uniform vec4 uSource;
uniform vec4 uSwirl;
uniform vec3 uLayer;
uniform float uColumn;
uniform vec2 uSpread;
uniform float uOpacity;
uniform float uSteps;
uniform vec3 uEye;
varying vec3 vLocal;
/** A value noise in three dimensions (0–1): one read of the layered noise at a cell's corner, eased between cells. */
float noise3( vec3 x ) {
	vec3 i = floor( x );
	vec3 f = fract( x );
	f = f * f * ( 3.0 - 2.0 * f );
	vec2 uv = i.xy + vec2( ${LAYER_SHIFT[0]}.0, ${LAYER_SHIFT[1]}.0 ) * i.z + f.xy;
	vec2 layers = texture2D( uNoise3, ( uv + 0.5 ) / ${LAYERED_SIZE}.0 ).rg;
	return mix( layers.r, layers.g, f.z );
}
/**
 * How thick the steam is at \`p\` (the enclosure's own frame, metres from its middle): how much it hides a metre.
 * \`q\` is where \`p\` is in its noise's coarse octave (main: stepped along the look with it), \`fine\` the finer
 * octave's, read once for the whole look.
 */
float steam( vec3 p, vec3 q, float fine ) {
	float top = uHalf.y;
	float sigma;
	if ( p.y <= top ) {
		// In the enclosure: the layer under its top, reaching down as it heats; the column off the water.
		float h = ( p.y + uHalf.y ) / ( 2.0 * uHalf.y );
		float layer = smoothstep( uLayer.x, uLayer.y, h ) * ( 0.3 + 0.7 * h * h ) * uLayer.z;
		vec2 d = ( p.xz - uSource.xy ) / uSource.zw;
		float column = exp( - dot( d, d ) ) * smoothstep( 0.05, 0.45, h ) * uColumn;
		// (The tray's fade twice the walls' depth: one smoothstep for both.)
		vec2 side = uHalf.xz - abs( p.xz );
		float walls = smoothstep( 0.0, 0.08, min( min( side.x, side.y ), ( p.y + uHalf.y ) * 0.53 ) );
		sigma = ( layer + column ) * walls;
	} else {
		// Over its top: out into the room as far as it has spread (uSpread.x), up off the enclosure's plan before it
		// goes out, gathering under the ceiling, soft against it and the room's walls.
		float over = p.y - top;
		float out_ = length( max( abs( p.xz ) - uHalf.xz, 0.0 ) );
		float rise = clamp( over / max( uCeiling - top, 0.1 ), 0.0, 1.0 );
		float s = exp( - out_ / uSpread.x ) * mix( 1.0, 0.5 + 0.7 * rise, smoothstep( 0.0, 0.3, out_ ) );
		s *= mix( 1.0, smoothstep( 0.0, 0.25, over ), smoothstep( 0.0, 0.12, out_ ) );
		vec2 room = min( p.xz - uSpill.xz, uSpill.yw - p.xz );
		s *= smoothstep( 0.0, 0.2, uCeiling - p.y ) * smoothstep( 0.0, 0.15, min( room.x, room.y ) );
		sigma = s * uSpread.y;
	}
	// (None here: no noise to read.)
	if ( sigma < 1e-3 ) return 0.0;
	float n = smoothstep( 0.25, 0.85, 0.65 * noise3( q ) + fine );
	// Billows a hand or two across, their gaps thinner but never clear, rather than an even fog.
	return sigma * ( 0.25 + 1.8 * n * sqrt( n ) );
}
/** A point in the plan turned about the water as the noise's coarse octave (\`swirl\` xy) or its fine one (zw) is now. */
vec2 turn( vec2 c, vec2 swirl ) {
	return vec2( c.x * swirl.x - c.y * swirl.y, c.x * swirl.y + c.y * swirl.x );
}
void main() {
	#include <clipping_planes_fragment>
	// Where the look goes through the box: from the eye, if it is in it, else from where it enters.
	vec3 dir = normalize( vLocal - uEye );
	vec3 inverse = 1.0 / dir;
	vec3 a = ( uBoxMin - uEye ) * inverse;
	vec3 b = ( uBoxMax - uEye ) * inverse;
	vec3 lo = min( a, b );
	vec3 hi = max( a, b );
	float near = max( max( lo.x, lo.y ), max( lo.z, 0.0 ) );
	float far = min( min( hi.x, hi.y ), hi.z );
	if ( far <= near ) discard;
	// As many samples as the step asks for along a long look, fewer along a short one: no closer than HAZE_SPACING —
	// most looks in a shower end at a wall a metre off, and its finer grain is read once a look in any case.
	float steps = clamp( ceil( ( far - near ) / ${HAZE_SPACING.toFixed(2)} ), 2.0, uSteps );
	float stride = ( far - near ) / steps;
	float jitter = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
	// The first sample, and the step from one to the next — in the box, and in the noise's coarse octave, which
	// rises through it and turns about the water (the same at every step of one look: worked out once). Its
	// finer octave, quicker and turning the other way, read once, half way along the look: a sample of it at
	// every step was most of what the steam cost a frame, standing in it, for little more to see.
	vec3 p = uEye + dir * ( near + jitter * stride );
	vec3 dp = dir * stride;
	vec2 c = turn( p.xz - uSource.xy, uSwirl.xy );
	vec2 d = turn( dp.xz, uSwirl.xy );
	vec3 q = vec3( c.x, p.y - uTime * 0.16, c.y ) * 1.4;
	vec3 dq = vec3( d.x, dp.y, d.y ) * 1.4;
	vec3 middle = uEye + dir * ( ( near + far ) * 0.5 );
	vec2 m = turn( middle.xz - uSource.xy, uSwirl.zw );
	float fine = 0.35 * noise3( vec3( m.x, middle.y - uTime * 0.29, m.y ) * 3.6 + 7.31 );
	float depth = 0.0;
	for ( int i = 0; i < ${HAZE_STEPS}; i++ ) {
		if ( float( i ) >= steps ) break;
		depth += steam( p, q, fine );
		p += dp;
		q += dq;
	}
	float cover = 1.0 - exp( - depth * stride );
	if ( cover < 0.002 ) discard;
	// A veil, never a smoke (STEAM_VEIL, STEAM_GLOW): the room's light given back as much as it is thick, and a
	// little more, a whiter light than the room's own tint; what is behind hidden less than that.
	float alpha = cover * ${STEAM_VEIL.toFixed(2)} * uOpacity;
	float grey = dot( uLight, vec3( 0.2126, 0.7152, 0.0722 ) );
	vec3 colour = mix( vec3( grey ), uLight, 0.8 ) * ${(STEAM_GLOW / STEAM_VEIL).toFixed(3)};
${FRAGMENT_TAIL}
}
`;

/**
 * A box of a shower's steam (the volume's comment above): the enclosure's
 * own, or the room's over its top — the same steam, each drawn from its own
 * box. `light` is its enclosure's.
 */
export function hazeMaterial(shared, light) {
    return material(
        "steam_haze",
        {
            uTime: shared.uTime,
            uNoise3: shared.uNoise3,
            uLight: light,
            uHalf: { value: new THREE.Vector3(0.5, 1, 0.5) },
            uBoxMin: { value: new THREE.Vector3(-0.5, -1, -0.5) },
            uBoxMax: { value: new THREE.Vector3(0.5, 1, 0.5) },
            uSpill: { value: new THREE.Vector4(-1, 1, -1, 1) },
            uCeiling: { value: 1.75 },
            uSource: { value: new THREE.Vector4(0, 0, 0.15, 0.15) },
            uSwirl: shared.uSwirl,
            uLayer: { value: new THREE.Vector3(0.7, 1.3, 0) },
            uColumn: { value: 0 },
            uSpread: { value: new THREE.Vector2(0.1, 0) },
            uOpacity: { value: 1 },
            uSteps: { value: 8 },
            uEye: { value: new THREE.Vector3() },
        },
        HAZE_VERTEX,
        HAZE_FRAGMENT,
        // (Drawn from outside its box by the faces towards the eye, from inside it by those away: Water turns it.)
        { side: THREE.FrontSide }
    );
}

// --- the mist on the glass ---------------------------------------------

const MIST_VERTEX = /* glsl */ `
${VERTEX_HEAD}
varying vec2 vUv;
varying vec2 vAt;
void main() {
	vUv = uv;
	// Where it is on the pane, in metres from its bottom corner: the pane's size is its matrix's scale.
	vAt = uv * vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
	gl_Position = projectionMatrix * mvPosition;
${VERTEX_TAIL}
}
`;

/**
 * The mist on a pane: where it has formed, how thick, and what of it the
 * eye can make out from where it is.
 */
const MIST_FRAGMENT = /* glsl */ `
${FRAGMENT_HEAD}
${HASH}
uniform float uMist;
uniform float uSeed;
uniform vec3 uLight;
uniform sampler2D uNoise;
varying vec2 vUv;
varying vec2 vAt;
void main() {
	#include <clipping_planes_fragment>
	vec2 p = vAt + uSeed;
	// Warm, wet air rises: the mist forms at the top of the pane and creeps down it as the steam fills the
	// enclosure from its top, and goes back up it as it clears — its lower edge soft and a little ragged.
	float coarse = texture2D( uNoise, p * 0.7 ).r;
	float edge = 1.05 - uMist;
	float formed = smoothstep( edge - 0.05, edge + 0.25, vUv.y + ( coarse - 0.5 ) * 0.3 );
	// Thicker high up, where the air is hottest, and a little here and there: an even veil, never blotches,
	// which read as dirt.
	float body = formed * ( 0.72 + 0.28 * vUv.y ) * mix( 0.88, 1.0, smoothstep( 0.3, 0.7, coarse ) );
	// Close to, droplets: beads a millimetre or so across where the finest have run together, clearer than the
	// fog round them. Further off, where a pixel takes in several, only the veil they make — the pattern faded
	// out as it would only shimmer (at arm's length it is gone).
	vec2 fine = p * 40.0;
	float sharp = 1.0 - clamp( ( length( fwidth( fine ) ) * 32.0 - 0.35 ) * 2.0, 0.0, 1.0 );
	float beads = 0.0;
	// (Read at its finest in the branch, where derivatives are not to be had: only close to, where that is right.)
	if ( sharp > 0.0 ) beads = smoothstep( 0.6, 0.66, textureLod( uNoise, fine, 0.0 ).g ) * sharp;
	// And runs: here and there, once it is thick, a drop grown heavy has run down it and wiped a clear line,
	// a bead at its foot — one in some twenty columns of two centimetres, later in some than in others. (The
	// rest of the columns, nothing more to work out.)
	float columns = p.x / 0.02;
	float column = floor( columns );
	float soft = max( fwidth( p.x ), 0.0004 );
	float runs = 0.0;
	float bead = 0.0;
	if ( hash11( column * 3.7 + 1.9 ) > 0.95 ) {
		float wander = ( textureLod( uNoise, vec2( column * 0.37, p.y * 0.8 ), 2.0 ).r - 0.5 ) * 0.5;
		float across = abs( fract( columns ) - 0.5 + wander * 0.3 ) * 0.02;
		float width = 0.0011 + 0.0005 * hash11( column * 5.3 );
		float line = 1.0 - smoothstep( width - soft, width + soft, across );
		float start = mix( 0.8, 0.97, hash11( column * 2.1 + 0.4 ) );
		float run = smoothstep( mix( 0.6, 0.92, hash11( column * 0.71 + 3.3 ) ), 1.0, uMist );
		float foot = start - run * mix( 0.15, 0.55, hash11( column * 1.3 ) );
		runs = line * step( foot, vUv.y ) * step( vUv.y, start ) * formed;
		bead = ( 1.0 - smoothstep( width * 1.6 - soft, width * 1.6 + soft, length( vec2( across, ( vUv.y - foot ) * 0.6 ) ) ) ) * step( 0.02, run );
	}
	float density = uMist * body * ( 1.0 - 0.35 * beads ) * ( 1.0 - 0.85 * runs ) + bead * 0.5 * uMist;
	if ( density < 0.003 ) discard;
	// Fine droplets scatter the light they are in: a pale veil over the room behind, whiter than the glass's own
	// reflections, that hides much of it — seen as the steam is (STEAM_VEIL, STEAM_GLOW), never a dirty smear.
	float alpha = density * 0.82 * ${STEAM_VEIL.toFixed(2)};
	float grey = dot( uLight, vec3( 0.2126, 0.7152, 0.0722 ) );
	vec3 colour = mix( vec3( grey ), uLight, 0.75 ) * ( 0.95 + 0.1 * coarse ) * ${(STEAM_GLOW / STEAM_VEIL).toFixed(3)};
${FRAGMENT_TAIL}
}
`;

/** The mist on a shower's glass (the class's comment). */
export function mistMaterial(shared, light) {
    return material(
        "water_mist",
        {
            uNoise: shared.uNoise,
            uLight: light,
            uMist: { value: 0 },
            uSeed: { value: 0 },
        },
        MIST_VERTEX,
        MIST_FRAGMENT
    );
}

/** Every kind of material here, by name, for making one of each before any is needed (Water.warm). */
export const MATERIALS = {
    stream: streamMaterial,
    splash: splashMaterial,
    ripple: rippleMaterial,
    rain: rainMaterial,
    steam: steamMaterial,
    haze: hazeMaterial,
    mist: mistMaterial,
};

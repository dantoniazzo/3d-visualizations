import * as THREE from "three";

/**
 * What the site's plants share in their shaders (World/Flora): the time
 * and the wind they sway in, and the sun, which shines through a leaf
 * seen against it.
 */
export const shared = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0.8, 0.45) },
    // The sun, towards it, in view space, and its colour: for light
    // through the leaves (set each frame, Flora.update).
    uSunView: { value: new THREE.Vector3(0, 1, 0) },
    uSunColour: { value: new THREE.Color(1, 1, 1) },
};

/** A plant's sway: its tips the most, its base not at all, out of step with its neighbours. */
export const windChunk = /* glsl */ `
uniform float uTime;
uniform vec2 uWind;
vec3 sway( vec3 local, vec3 root, float reach, float strength ) {
    float phase = dot( root.xz, vec2( 0.131, 0.173 ) );
    float gust = sin( uTime * 0.83 + phase ) * 0.55 + sin( uTime * 1.97 + phase * 1.7 ) * 0.3 + 0.35;
    float flutter = sin( uTime * 6.3 + dot( local, vec3( 4.1, 3.3, 3.7 ) ) + phase * 3.0 );
    float bend = reach * reach * strength;
    return vec3( uWind.x, 0.0, uWind.y ) * gust * bend + vec3( flutter, flutter * 0.5, -flutter ) * 0.012 * reach * strength * 8.0;
}
`;

/** Light through a leaf seen against the sun, added to what it gives off. */
export const throughChunk = /* glsl */ `
uniform vec3 uSunView;
uniform vec3 uSunColour;
uniform float uThrough;
`;

export const throughFragment = /* glsl */ `
{
    vec3 toEye = normalize( vViewPosition );
    float against = pow( max( dot( -toEye, uSunView ), 0.0 ), 3.0 );
    totalEmissiveRadiance += diffuseColor.rgb * uSunColour * against * uThrough;
}
`;

/** Normals that do not turn over on a leaf card's back: foliage is lit as a mass, either side. */
export const unflippedNormal = THREE.ShaderChunk.normal_fragment_begin.replace(/normal \*= faceDirection;/g, "");

/**
 * Plant material changes: sway in the wind (its tips by `strength`,
 * measured up `height` metres from its root), light through its leaves
 * (`through`), its normals kept facing out on both sides.
 */
export function plantShader(material, { height = 10, strength = 0.004, through = 0, key = "plant", unflip = true } = {}) {
    const uThrough = { value: through };
    material.userData.through = uThrough;
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, shared, { uThrough });
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", `#include <common>\n${windChunk}`)
            .replace(
                "#include <begin_vertex>",
                `#include <begin_vertex>
{
    #ifdef USE_INSTANCING
        vec3 root = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
    #else
        vec3 root = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
    #endif
    float reach = clamp( position.y / ${height.toFixed(2)}, 0.0, 1.5 );
    transformed += sway( position, root, reach, ${strength.toFixed(5)} ) * ${height.toFixed(2)};
}`
            );
        shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${throughChunk}`);
        if (unflip) shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", unflippedNormal);
        shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_end>", `#include <lights_fragment_end>\n${throughFragment}`);
    };
    material.customProgramCacheKey = () => `flora-${key}`;
    return material;
}

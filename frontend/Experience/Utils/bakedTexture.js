import * as THREE from "three";

/** The file decoded off the main thread, as it is stored: not flipped, its colours and alpha untouched. */
const bitmaps =
    typeof createImageBitmap === "function"
        ? new THREE.ImageBitmapLoader().setOptions({ premultiplyAlpha: "none", colorSpaceConversion: "none" })
        : null;
const images = new THREE.TextureLoader();

/**
 * A baked picture — a lightmap, a light switch's layer, the sun's mask, the
 * doors' atlas — loaded as a texture with its file decoded off the main
 * thread (createImageBitmap). Decoded on it, as an <img>'s is the first
 * time it is drawn, a 4096² lightmap holds a frame up for as long as that
 * takes: at load, and again at the first night with its few hundred layers.
 *
 * The texture is as one from an <img> is once SceneBuilder's
 * prepareLightmap has set it up: the picture the way up it is stored, its
 * values as they are in the file (no colour management, no alpha
 * multiplied in), mipmapped as it is uploaded. The decoded picture is given
 * back as soon as the GPU has it: kept, it would hold four bytes a texel
 * for as long as the view is open, where the browser may drop an <img>'s.
 *
 * Where a browser cannot — no createImageBitmap, or none that takes these
 * options — from an <img>, as before.
 *
 * @param {string} url
 * @returns {Promise<THREE.Texture>}
 */
export async function loadBakedTexture(url) {
    if (bitmaps !== null) {
        let bitmap = null;
        try {
            bitmap = await bitmaps.loadAsync(url);
        } catch {
            // Tried as an <img>, which says what is wrong with it if it fails too.
        }
        if (bitmap) {
            const texture = new THREE.Texture(bitmap);
            texture.name = url.split("/").pop();
            // Its size, for whoever needs it once the picture is given back (World/LightResolver.js).
            texture.userData.size = [bitmap.width, bitmap.height];
            // An ImageBitmap is uploaded as it was decoded — not flipped — whatever this says: said as it is.
            texture.flipY = false;
            texture.onUpdate = () => {
                texture.onUpdate = null;
                bitmap.close?.();
            };
            texture.needsUpdate = true;
            return texture;
        }
    }
    return images.loadAsync(url);
}

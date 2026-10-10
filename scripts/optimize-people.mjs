/**
 * The people the app sets round a property, made ready for the web from
 * the characters and clips downloaded from Mixamo (assets/people/, which
 * blender/import_people.py reads first): each character packed as the
 * avatars are (scripts/optimize-avatars.mjs), the clips as one file, and
 * one index of them all — public/models/people/index.json — which
 * frontend/Experience/World/People.js and shared/people.js load.
 *
 * A character keeps its meshes, materials and skeleton; its textures are
 * sized for a person a few hundred pixels tall at most (colour 1024
 * square, normal maps 512, all WebP) and its morph targets, which nothing
 * drives, go. The clips keep each bone's turn and only the Hips' place:
 * every other bone's place, and every scale, is the clip skeleton's own
 * proportions, which would stretch a character of another size. Keys that
 * sit on the straight line between their neighbours are dropped; meshopt
 * packs what is left, rotations with its own filter.
 *
 * The index, with every path from /models/:
 *
 *   characters: [{ id, name, file: "people/<id>.glb", height, hips, legs, sits, sex, eyes, mouth }]
 *   clips: { file: "people/clips.glb", hips, legs, list: [{ name, pose, hand,
 *            tilt, curl, pelvis, seat, head, duration, feet?, tuck?, knee?, far?, reach?, sex?, still? }] }
 *   props: { file: "people/props.glb", list: [{ id, node, grip }] }   (once props.glb is there;
 *          node as three.js names it, grip "right" | "left" | null)
 *
 * `hips` is how high the pelvis stands, in metres: a clip moves the Hips
 * as for a skeleton of the clips' `hips`, so on a character its Hips
 * track, and the clip's pelvis, seat and feet, are scaled by
 * character.hips / clips.hips. `pelvis` is the Hips at the clip's first
 * frame from the character's root (its feet when standing), Y up, facing
 * +Z; `seat`, for a clip that sits or lies, the point under the pelvis
 * that rests on the seat; `head`, the head's place, which way a lying
 * clip's head lies. `feet`, for a clip that sits, is where its feet rest
 * at its first frame, at the height of its soles: seat[1] − feet[1] is
 * the height of the seat it was made for, on which its feet are on the
 * floor (0.33–0.44 m for Mixamo's; on a higher seat they hang, on a
 * lower one they are under the floor). `tuck` and `knee`, for a clip
 * that sits, are how far forward of its seat its rearmost ankle and its
 * rearmost knee ever are, over all its frames (of the legs whose feet are
 * down): a seat whose front edge is further forward than its knees has
 * its shins in the cushion, and one with a solid base, further forward
 * than its ankles, its feet in the base. `far` is how far forward its
 * foremost ankle ever is: what stands that near before the seat (a
 * coffee table) has its feet in it. All three are the clips' own
 * skeleton's, whose thighs and shins are `clips.legs` long ([thigh,
 * shin], in metres): on a character they come as its own `legs` are to
 * those — its knees by its thighs, its ankles from its knees by its
 * shins (shared/people.js) — since a clip only turns the bones. Better,
 * a character's `sits` says how each sitting clip sits on that very
 * body, measured in Blender with the body posed as the clip:
 * { "<clip>": [seat, knee, tuck, far] }, in metres — the height of the
 * seat that puts its soles on the floor, and its rearmost knee, rearmost
 * ankle and foremost ankle forward of its seat. No two bodies rest
 * alike, so these differ by centimetres from any scaling of the clip's.
 * `reach`, for a clip that lies, is how far from its midline its hands
 * lie at its first frame: on a lounger narrower than twice that they
 * rest on the air — the app brings its arms in (World/People.js).
 *
 * A character's `eyes` is where its eyes are on its head, at rest: [x,
 * up, forward] from its head's joint, in metres — midway between them,
 * as high as they are, as far forward as the front of its face round
 * them, where the lenses of a pair of glasses hang. Null for a
 * character it could not be found on, who is given no sunglasses. Its
 * `mouth` is its lips likewise, on its midline: what a bottle is tipped
 * at (a guess for everybody, where it is null).
 *
 * `hand` is the hand that can hold a glass all through the clip —
 * "right", "left", or false for neither — measured in Blender over every
 * frame (blender/import_people.py's hand_now, TILT_MOST, CURL_LEAST, and
 * its HANDS for the drinking clips): `tilt` is, for each hand, the
 * furthest off upright a glass in its fist ever points, and `curl` the
 * least its fingers are ever curled, both in degrees. What is held goes
 * in that hand, whichever the prop's own `grip` says. `sex` is "f" or
 * "m" for a character (null for one the pipeline's SEXES doesn't list)
 * and for a clip made for one ("Laying Propped Female"); `still` marks a
 * clip of one pose, which doesn't move.
 *
 * With nothing downloaded (or --standin), it makes the stand-ins instead,
 * from the app's own avatars — index.standin.json, standin-*.glb and
 * clips.standin.glb (Idle, and a sitting and a lying pose made from it) —
 * which the app loads when there is no index.json.
 *
 *   npm run people
 *   npm run people -- --standin                    the stand-ins, whatever is downloaded
 *   npm run people -- --src <dir> --out <dir>      another set, somewhere else
 *   npm run people -- --keep                       keep Blender's unpacked output (printed)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample, textureCompress, weld } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

import { findBlender } from "./lib/blender.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** How far a resampled key may be from the curve it stands for (as the avatars). */
const TOLERANCE = 0.0001;
const TEXTURE_SIZE = 1024;
const NORMAL_SIZE = 512;
/** What the props agent's props.glb holds, by node name (or a node's extras.prop). */
const PROP_IDS = ["wine-red", "wine-white", "flute", "tumbler", "beer", "coffee", "towel", "book"];

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const at = args.indexOf(name);
    return at >= 0 && args[at + 1] && !args[at + 1].startsWith("--") ? resolve(args[at + 1]) : fallback;
};
const SRC = option("--src", join(ROOT, "assets", "people"));
const OUT = option("--out", join(ROOT, "public", "models", "people"));
const KEEP = args.includes("--keep");

const fbx = (folder) => {
    const dir = join(SRC, folder);
    return existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".fbx")) : [];
};
const downloads = { characters: fbx("characters"), animations: fbx("animations") };
const STANDIN = args.includes("--standin") || (!downloads.characters.length && !downloads.animations.length);
if (!STANDIN && (!downloads.characters.length || !downloads.animations.length)) {
    console.error(
        `Need both characters and clips in ${SRC}: ${downloads.characters.length} in characters/, ` +
            `${downloads.animations.length} in animations/. (With neither, this makes the stand-ins.)`
    );
    process.exit(1);
}

const blender = findBlender();
if (!blender) {
    console.error("Blender not found: install Blender 4.2 or newer, or point BLENDER at it (BLENDER=/path/to/blender npm run people).");
    process.exit(1);
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
});

/** On disk, and as sent — the server gzips it. */
const size = (path) => {
    const bytes = statSync(path).size;
    const sent = gzipSync(readFileSync(path)).length;
    return `${(bytes / 1024).toFixed(0)} KB (${(sent / 1024).toFixed(0)} KB sent)`;
};

/** A node's name as three.js's GLTFLoader names it (PropertyBinding.sanitizeNodeName). */
const sanitizeNodeName = (name) => name.replace(/\s/g, "_").replace(/[[\].:/]/g, "");

/** A GLB's JSON chunk, without decoding its buffers. */
const glbJson = (path) => {
    const buffer = readFileSync(path);
    return JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString("utf8"));
};

/**
 * Mixamo's body and hair come blended (Blender reads their texture's alpha
 * as transparency): sorted per object, hair cards over each other and the
 * whole body drawn after the room, and casting square shadows. A texture
 * whose alpha is all opaque makes it opaque; any other is alpha-tested at
 * half, which three.js's shadows honour.
 */
async function unblend(root) {
    for (const material of root.listMaterials()) {
        if (material.getAlphaMode() !== "BLEND") continue;
        const image = material.getBaseColorTexture()?.getImage();
        const opaque = image ? (await sharp(image).stats()).isOpaque : material.getAlpha() >= 0.99;
        if (opaque) {
            material.setAlphaMode("OPAQUE");
        } else {
            material.setAlphaMode("MASK");
            material.setAlphaCutoff(0.5);
        }
    }
}

async function packCharacter(input, output) {
    const document = await io.read(input);
    const root = document.getRoot();
    await unblend(root);
    for (const animation of root.listAnimations()) animation.dispose();
    for (const mesh of root.listMeshes()) {
        mesh.setWeights([]);
        for (const prim of mesh.listPrimitives()) {
            for (const target of prim.listTargets()) target.dispose();
        }
    }
    await document.transform(
        prune({ keepLeaves: true }),
        dedup(),
        weld(),
        textureCompress({ encoder: sharp, targetFormat: "webp", slots: /^normalTexture$/, resize: [NORMAL_SIZE, NORMAL_SIZE], quality: 85 }),
        textureCompress({ encoder: sharp, targetFormat: "webp", slots: /^(?!normalTexture$)/, resize: [TEXTURE_SIZE, TEXTURE_SIZE], quality: 85 }),
        meshopt({ encoder: MeshoptEncoder, level: "high" })
    );
    await io.write(output, document);
}

async function packClips(input, output) {
    const document = await io.read(input);
    const root = document.getRoot();
    let dropped = 0;
    for (const animation of root.listAnimations()) {
        for (const channel of animation.listChannels()) {
            const path = channel.getTargetPath();
            const hips = /Hips$/.test(channel.getTargetNode()?.getName() ?? "");
            if (path === "scale" || (path === "translation" && !hips)) {
                const sampler = channel.getSampler();
                channel.dispose();
                if (sampler && !sampler.listParents().some((p) => p.propertyType === "AnimationChannel")) sampler.dispose();
                dropped++;
            }
        }
    }
    await document.transform(
        resample({ tolerance: TOLERANCE }),
        // the skeleton is all there is: keep its bones, which are all leaves to prune
        prune({ keepLeaves: true }),
        dedup(),
        meshopt({ encoder: MeshoptEncoder, level: "high" })
    );
    await io.write(output, document);
    return { clips: root.listAnimations().length, dropped };
}

/** props.glb's entry, if the props agent has made it: its nodes by prop id. */
function propsEntry(previous) {
    const path = join(OUT, "props.glb");
    if (!existsSync(path)) return undefined;
    const before = new Map((previous?.props?.list ?? []).map((p) => [p.id, p]));
    const found = new Map();
    for (const node of glbJson(path).nodes ?? []) {
        // extras.prop: { id, grip, ... } as the props are made, or just the id
        const tag = node.extras?.prop;
        const info = tag && typeof tag === "object" ? tag : { id: tag };
        const id = info.id ?? node.name?.replace(/^prop:/, "");
        if (!id || found.has(id) || !(PROP_IDS.includes(id) || tag)) continue;
        // grip null: not held (a towel laid out, sunglasses worn)
        const grip = info.grip !== undefined ? info.grip : (before.get(id)?.grip ?? "right");
        // by the name three.js's loader gives it ("prop:flute" becomes "propflute")
        found.set(id, { id, node: sanitizeNodeName(node.name), grip });
    }
    const missing = PROP_IDS.filter((id) => !found.has(id));
    if (missing.length) console.warn(`  props.glb has no node for ${missing.join(", ")}`);
    const ids = [...PROP_IDS.filter((id) => found.has(id)), ...[...found.keys()].filter((id) => !PROP_IDS.includes(id))];
    return { file: "people/props.glb", list: ids.map((id) => found.get(id)) };
}

// ---------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
const raw = mkdtempSync(join(tmpdir(), "people-"));
console.log(
    STANDIN
        ? `Stand-ins, from the app's avatars (nothing downloaded in ${SRC})`
        : `${downloads.characters.length} characters and ${downloads.animations.length} clips from ${SRC}`
);
console.log(`Using ${blender.version}\n`);
execFileSync(
    blender.path,
    [
        "--background",
        "--factory-startup",
        "--python-exit-code",
        "1",
        "--python",
        join(ROOT, "blender", "import_people.py"),
        "--",
        "--src",
        SRC,
        "--out",
        raw,
        ...(STANDIN ? ["--standin"] : []),
    ],
    { stdio: "inherit" }
);

const meta = JSON.parse(readFileSync(join(raw, STANDIN ? "people.standin.json" : "people.json"), "utf8"));
const indexPath = join(OUT, STANDIN ? "index.standin.json" : "index.json");
const previous = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : null;

console.log("\n> packing");
for (const character of meta.characters) {
    await packCharacter(join(raw, character.file), join(OUT, character.file));
    console.log(`  ${character.file}: ${size(join(raw, character.file))} -> ${size(join(OUT, character.file))}`);
    if (character.height < 1.4 || character.height > 2.1) {
        console.warn(`  WARNING ${character.id} is ${character.height} m tall — wrong units in the download?`);
    }
}
const packed = await packClips(join(raw, meta.clips.file), join(OUT, meta.clips.file));
console.log(
    `  ${meta.clips.file}: ${size(join(raw, meta.clips.file))} -> ${size(join(OUT, meta.clips.file))}, ` +
        `${packed.clips} clips, ${packed.dropped} channels of bone places and scales dropped`
);

const index = {
    characters: meta.characters.map(({ id, name, file, height, hips, legs, sits, sex, eyes, mouth }) => ({
        id,
        name,
        file: `people/${file}`,
        height,
        hips,
        legs: legs ?? null,
        sex: sex ?? null,
        eyes: eyes ?? null,
        mouth: mouth ?? null,
        ...(sits && Object.keys(sits).length ? { sits } : {}),
    })),
    clips: {
        file: `people/${meta.clips.file}`,
        hips: meta.clips.hips,
        legs: meta.clips.legs ?? null,
        list: meta.clips.list
            .map(({ name, pose, hand, tilt, curl, pelvis, seat, head, duration, feet, tuck, knee, far, reach, sex, still }) => ({
                name,
                pose,
                hand,
                tilt: tilt ?? null,
                curl: curl ?? null,
                pelvis,
                seat,
                head,
                duration,
                // only where they apply: a sitting clip's feet and how far back its legs come, a lying one's reach, a clip for women or men, a single pose
                ...(feet ? { feet } : {}),
                ...(tuck !== undefined ? { tuck, knee, far } : {}),
                ...(reach !== undefined ? { reach } : {}),
                ...(sex ? { sex } : {}),
                ...(still ? { still: true } : {}),
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
    },
};
const props = propsEntry(previous);
if (props) index.props = props;
writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");

// A character no longer downloaded leaves its GLB behind: drop it.
if (!STANDIN && previous) {
    const now = new Set(index.characters.map((c) => c.file));
    for (const old of previous.characters ?? []) {
        const file = join(OUT, old.file.replace(/^people\//, ""));
        if (!now.has(old.file) && existsSync(file)) {
            unlinkSync(file);
            console.log(`  removed ${old.file}, no longer downloaded`);
        }
    }
}

console.log(
    `\n  ${indexPath.replace(ROOT + "/", "")}: ${index.characters.length} characters, ` +
        `${index.clips.list.length} clips${props ? `, ${props.list.length} props` : ""}`
);
if (KEEP) console.log(`  Blender's output kept in ${raw}`);
else rmSync(raw, { recursive: true, force: true });

/**
 * Publish the model GLBs to S3-compatible storage.
 *
 * Models are build outputs rather than repository content, so a deployment
 * fetches them from a CDN instead of from the image. Build locally with
 * `npm run models`, then:
 *
 *   MODELS_BUCKET=my-bucket npm run upload-models
 *
 * Point the frontend at the result with VITE_MODEL_BASE at build time.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "public", "models");

const BUCKET = process.env.MODELS_BUCKET;
if (!BUCKET) {
    console.error("Set MODELS_BUCKET (and AWS credentials, or S3_ENDPOINT for R2).");
    process.exit(1);
}

const client = new S3Client({
    region: process.env.AWS_REGION || "auto",
    ...(process.env.S3_ENDPOINT
        ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
        : {}),
});

const TYPES = { ".glb": "model/gltf-binary", ".webp": "image/webp", ".json": "application/json" };

// The GLBs at the top, and the cars the editor offers — each car's folder
// (body, wheels, picture) and the index of them (npm run models -- --cars).
const files = (await readdir(DIR)).filter((f) => f.endsWith(".glb"));
for (const entry of await readdir(join(DIR, "cars"), { withFileTypes: true }).catch(() => [])) {
    if (entry.isFile() && entry.name === "index.json") files.push("cars/index.json");
    if (!entry.isDirectory()) continue;
    for (const name of await readdir(join(DIR, "cars", entry.name))) {
        if (TYPES[extname(name)] && name !== "car.json") files.push(`cars/${entry.name}/${name}`);
    }
}
if (!files.length) {
    console.error(`No models in ${DIR} — run \`npm run models\` first.`);
    process.exit(1);
}

for (const file of files) {
    const body = await readFile(join(DIR, file));
    await client.send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key: `models/${file}`,
            Body: body,
            ContentType: TYPES[extname(file)],
            // Models are immutable once built; a rebuild changes the content,
            // so a long cache with revalidation is safe. The cars' index
            // changes whenever a car is added, so it is kept briefly.
            CacheControl: file.endsWith("index.json") ? "public, max-age=300" : "public, max-age=31536000, immutable",
        })
    );
    console.log(`  ${(body.length / 1048576).toFixed(1)} MB  models/${file}`);
}
console.log(`\nUploaded ${files.length} file(s). Set VITE_MODEL_BASE to your CDN origin.`);

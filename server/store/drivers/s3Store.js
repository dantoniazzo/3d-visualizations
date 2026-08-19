/**
 * Scene storage on S3-compatible object storage — AWS S3, Cloudflare R2,
 * Backblaze B2, MinIO.
 *
 * Deployments do not get a writable filesystem they can rely on: a container
 * that restarts loses anything on local disk, and horizontal scaling means two
 * instances would not see each other's scenes. Object storage gives both
 * durability and a single shared view.
 */
import {
    S3Client,
    GetObjectCommand,
    PutObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command,
} from "@aws-sdk/client-s3";

import { slugify, assertSlug } from "../ids.js";

const BUCKET = process.env.SCENES_BUCKET;
const PREFIX = (process.env.SCENES_PREFIX || "scenes/").replace(/^\/+/, "");

const client = new S3Client({
    region: process.env.AWS_REGION || "auto",
    // R2 and MinIO need an explicit endpoint; plain AWS S3 does not.
    ...(process.env.S3_ENDPOINT
        ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
        : {}),
});

const keyFor = (id) => `${PREFIX}${assertSlug(id)}.json`;

async function body(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
}

export async function readScene(id) {
    try {
        const out = await client.send(
            new GetObjectCommand({ Bucket: BUCKET, Key: keyFor(id) })
        );
        return JSON.parse(await body(out.Body));
    } catch (error) {
        if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
            return null;
        }
        throw error;
    }
}

export async function listScenes() {
    const scenes = [];
    let token;

    do {
        const page = await client.send(
            new ListObjectsV2Command({
                Bucket: BUCKET,
                Prefix: PREFIX,
                ContinuationToken: token,
            })
        );
        for (const item of page.Contents || []) {
            if (!item.Key.endsWith(".json")) continue;
            const id = item.Key.slice(PREFIX.length, -".json".length);
            try {
                const raw = await readScene(id);
                if (!raw) continue;
                scenes.push({
                    id,
                    name: raw.name || id,
                    summary: raw.summary || "",
                    brief: raw.brief || "",
                    updated_at: raw.updated_at || item.LastModified?.toISOString(),
                });
            } catch {
                // A single unreadable object should not blank the whole list.
            }
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);

    scenes.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    return scenes;
}

export async function writeScene({ id, scene, brief, notes }) {
    let sceneId = id;
    if (!sceneId) {
        const base = slugify(scene.name);
        sceneId = base;
        let n = 2;
        while (await readScene(sceneId)) sceneId = `${base}-${n++}`;
    }

    const record = {
        id: sceneId,
        name: scene.name,
        summary: scene.summary,
        brief: brief || "",
        notes: notes || [],
        updated_at: new Date().toISOString(),
        scene,
    };

    await client.send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key: keyFor(sceneId),
            Body: JSON.stringify(record, null, 2),
            ContentType: "application/json",
        })
    );
    return record;
}

export async function deleteScene(id) {
    if (!(await readScene(id))) return false;
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: keyFor(id) }));
    return true;
}

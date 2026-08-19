/**
 * Scene persistence, behind one interface.
 *
 * Which driver runs is decided by configuration alone, so nothing that calls
 * this has to know: set `SCENES_BUCKET` and scenes live in S3-compatible
 * object storage, otherwise they are JSON files under `scenes/`. Local
 * development and `npm run seed` use the filesystem with no setup.
 */
const useS3 = Boolean(process.env.SCENES_BUCKET);

const driver = useS3
    ? await import("./drivers/s3Store.js")
    : await import("./drivers/fsStore.js");

export const storageBackend = useS3 ? "s3" : "filesystem";

export const listScenes = driver.listScenes;
export const readScene = driver.readScene;
export const writeScene = driver.writeScene;
export const deleteScene = driver.deleteScene;

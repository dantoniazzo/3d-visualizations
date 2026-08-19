/** Scene id rules, shared by every storage driver so they cannot drift. */

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function slugify(name) {
    const base = String(name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
    return base || "scene";
}

/**
 * Guard every id that reaches a path or an object key. On the filesystem this
 * stops traversal out of the scenes directory; on object storage it stops a
 * key escaping its prefix.
 */
export function assertSlug(id) {
    if (!SLUG.test(id)) throw new Error(`Invalid scene id: ${id}`);
    return id;
}

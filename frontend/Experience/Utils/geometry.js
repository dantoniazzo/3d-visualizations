/**
 * Plan geometry shared by the slab builder and the editor.
 *
 * Points are `[u, v]` pairs. Callers decide what the axes mean — the slab
 * builder works in shape space (x, -z), the editor in plan space (x, z) —
 * so nothing here assumes a handedness beyond what each function states.
 */

const EPS = 1e-9;

export function signedArea(polygon) {
    let area = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        area += polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
    }
    return area / 2;
}

/** Counter-clockwise copy, in whatever frame the points are given. */
export function ensureCCW(polygon) {
    return signedArea(polygon) < 0 ? polygon.slice().reverse() : polygon.slice();
}

export function isConvex(polygon) {
    let sign = 0;
    const n = polygon.length;
    for (let i = 0; i < n; i++) {
        const [ax, ay] = polygon[i];
        const [bx, by] = polygon[(i + 1) % n];
        const [cx, cy] = polygon[(i + 2) % n];
        const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
        if (Math.abs(cross) < EPS) continue;
        const s = Math.sign(cross);
        if (sign === 0) sign = s;
        else if (s !== sign) return false;
    }
    return true;
}

/**
 * Keep the part of a convex polygon on one side of the line a -> b.
 * `side` 1 keeps the left (inside of a CCW edge), -1 the right.
 */
function clipHalfPlane(polygon, a, b, side) {
    const out = [];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dist = (p) => side * (dx * (p[1] - a[1]) - dy * (p[0] - a[0]));

    for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i];
        const q = polygon[(i + 1) % polygon.length];
        const dp = dist(p);
        const dq = dist(q);

        if (dp >= -EPS) out.push(p);
        if ((dp > EPS && dq < -EPS) || (dp < -EPS && dq > EPS)) {
            const t = dp / (dp - dq);
            out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }
    }
    return out;
}

/**
 * A convex polygon minus a convex hole, as a list of convex pieces.
 *
 * Piece i is what lies outside the hole's edge i but inside all the edges
 * before it, so the pieces tile the difference without overlapping. Both
 * inputs must be counter-clockwise.
 */
export function subtractConvex(polygon, hole) {
    const pieces = [];
    let remaining = polygon;

    for (let i = 0; i < hole.length && remaining.length >= 3; i++) {
        const a = hole[i];
        const b = hole[(i + 1) % hole.length];

        const outside = clipHalfPlane(remaining, a, b, -1);
        if (outside.length >= 3 && Math.abs(signedArea(outside)) > 1e-6) pieces.push(outside);

        remaining = clipHalfPlane(remaining, a, b, 1);
    }
    return pieces;
}

/**
 * Corners of a rectangle in plan space (x, z), turned by `yaw` radians the
 * way three.js turns an object about +Y.
 */
export function rectCorners(cx, cz, width, depth, yaw) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const hw = width / 2;
    const hd = depth / 2;
    return [
        [-hw, -hd],
        [hw, -hd],
        [hw, hd],
        [-hw, hd],
    ].map(([x, z]) => [cx + x * cos + z * sin, cz - x * sin + z * cos]);
}

export function pointInPolygon(x, z, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, zi] = polygon[i];
        const [xj, zj] = polygon[j];
        const intersects = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
        if (intersects) inside = !inside;
    }
    return inside;
}

export function polygonCentroid(polygon) {
    const sum = polygon.reduce((acc, [x, z]) => [acc[0] + x, acc[1] + z], [0, 0]);
    return [sum[0] / polygon.length, sum[1] / polygon.length];
}

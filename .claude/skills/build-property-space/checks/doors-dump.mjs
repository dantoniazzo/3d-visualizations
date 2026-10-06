#!/usr/bin/env node
/**
 * Every hinged door as the app hangs it: its wall as emitted (start -> end,
 * which side is A and the rooms either side), the opening's jambs, the swing,
 * the hinge it turns on, the side and room it opens into, where the leaf
 * stands at 90° and where its tip ends at Door.js's full opening angle. Site
 * coordinates, and building-local ones (L x,z) where the building's frame is
 * known. Use it to check a door's hand against the plan: the swing's name
 * says nothing once `outside` has turned a wall round.
 *
 *   node doors-dump.mjs                       # the seeded scene (default scenes/kosinozici-villas.json)
 *   node doors-dump.mjs c-g- a-f-w12          # only doors whose wall or opening id contains these
 *   node doors-dump.mjs --scene scenes/<id>.json --gen scripts/spaces/<project>
 *   node doors-dump.mjs --live                # the generator's output, validated as seeding does
 *   node doors-dump.mjs --live --gen <copy>/scripts/spaces/<project>
 *   node doors-dump.mjs --frame a=0,0 --frame b=0,24.2,0   # frames by hand (or --frame none)
 *   node doors-dump.mjs --json                # one object per door
 *
 * The hand comes from the app, not from a rule restated here: each door is
 * built with frontend/Experience/World/Door.js in a wall frame set up as
 * StructureBuilder.buildWall sets it (X along start -> end, side A = +Z, the
 * left of start -> end in plan), posed through Door.update, and read back.
 * In those terms: `_left` hinges on the start-side jamb, `_right` on the
 * end-side one; `outward` opens to side A, `inward` to side B; kit.js's
 * `wall()` makes side A face its `outside` point by swapping start and end,
 * which swaps the jambs. Building frames come from the generator (see
 * _doors.mjs); the repo is four directories up, or REPO=<dir>.
 */
import { parseArgs, loadSpace, swingingDoors, frameOf, roomAt, roomName, leafEdges, leafPoint, compass, pt, r3, THREE } from "./_doors.mjs";

const { opts, positional } = parseArgs(process.argv.slice(2), ["scene", "gen", "export", "frame"]);
const { spec, source, notes, frames, frameSource } = await loadSpace(opts);
const doors = swingingDoors(spec, { filter: positional });

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const mm = (m) => `${Math.round(m * 1000)} mm`;

const rows = [];
for (const d of doors) {
    const frame = frameOf(frames, d.wall?.id ?? d.id) ?? frameOf(frames, d.id);
    const A = d.sideA;
    const probe = (s) => [d.centre[0] + A[0] * s, d.centre[1] + A[1] * s];
    const half = (d.wall?.thickness ?? 0.2) / 2 + 0.3;
    const roomA = roomAt(spec, probe(half), d.base);
    const roomB = roomAt(spec, probe(-half), d.base);
    const along = d.wall ? [(d.wall.end[0] - d.wall.start[0]), (d.wall.end[1] - d.wall.start[1])] : sub(d.jambs[1], d.jambs[0]);
    const alongLen = Math.hypot(...along);
    const u = [along[0] / alongLen, along[1] / alongLen];
    const fullDeg = (d.fullAngle * 180) / Math.PI;
    const a90 = Math.PI / 2 / d.fullAngle;

    const leaves = d.leaves.map((L, k) => {
        const pivot = new THREE.Vector3();
        L.hinge.getWorldPosition(pivot);
        const hingeP = [pivot.x, pivot.z];
        const startSide = L.hingeSide < 0;
        const jamb = d.jambs[startSide ? 0 : 1];
        const pivotOff = dot(sub(hingeP, jamb), A);
        const { tip } = leafEdges(L);
        d.pose(a90);
        const tip90 = leafPoint(L, tip);
        d.pose(1);
        const tipFull = leafPoint(L, tip);
        d.pose(0);
        const opensA = dot(sub(tip90, hingeP), A) > 0;
        // How far the open leaf's tip passes the hinge jamb, along the wall away from the opening.
        const away = startSide ? [-u[0], -u[1]] : u;
        const past = dot(sub(tipFull, jamb), away);
        return {
            leaf: k,
            hinge: startSide ? "start" : "end",
            hingePoint: hingeP,
            pivotOffset: r3(pivotOff),
            opensTo: opensA ? "A" : "B",
            opensToward: compass(opensA ? A : [-A[0], -A[1]]),
            room: (opensA ? roomA : roomB)?.id ?? null,
            leafLength: r3(L.hi[0] - L.lo[0]),
            leafThickness: r3(L.hi[2] - L.lo[2]),
            tip90,
            tipFull,
            tipPastJamb: r3(past),
            frame,
        };
    });
    rows.push({
        wall: d.wall?.id ?? null,
        free: !!d.free,
        start: d.wall?.start ?? null,
        end: d.wall?.end ?? null,
        thickness: d.wall?.thickness ?? null,
        base: r3(d.base),
        sideA: compass(A),
        roomA: roomA?.id ?? null,
        roomB: roomB?.id ?? null,
        roomAName: roomName(roomA),
        roomBName: roomName(roomB),
        id: d.id,
        type: d.opening.door?.type ?? "hinged",
        swing: d.door.swing,
        width: d.opening.width,
        height: d.opening.height,
        leafKind: d.opening.door?.glazed ? "glazed" : d.opening.door?.flush ? "flush" : "panelled",
        jambs: d.jambs,
        fullAngleDeg: r3(fullDeg),
        frame,
        leaves,
    });
}

if (opts.json) {
    const out = rows.map(({ frame, leaves, ...r }) => ({
        ...r,
        frame: frame ? { tag: frame.tag, offset: [frame.ox, frame.oz, frame.oy] } : null,
        jambs: r.jambs.map((p) => p.map(r3)),
        leaves: leaves.map(({ frame: _f, hingePoint, tip90, tipFull, ...l }) => ({ ...l, hingePoint: hingePoint.map(r3), tip90: tip90.map(r3), tipFull: tipFull.map(r3) })),
    }));
    console.log(JSON.stringify({ source, frames: Object.fromEntries([...frames].map(([t, f]) => [t, [f.ox, f.oz, f.oy]])), doors: out }, null, 2));
    process.exit(0);
}

console.log(`doors-dump: ${source}${notes.length ? ` (validate notes: ${notes.length})` : ""}`);
console.log(`frames: ${frameSource}${frames.size ? ` — ${[...frames].map(([t, f]) => `${t} [${f.ox}, ${f.oz}, ${f.oy}]`).join(", ")}` : ""}`);
if (rows.length) console.log(`Door.js opens a hinged leaf ${rows[0].fullAngleDeg}° (from its update()); "L x,z" is building-local; 90° is the plan's drawn arc, full open is where the app parks the leaf.`);
console.log(`${rows.length} swinging door(s)${positional.length ? ` matching ${positional.join(", ")}` : ""}\n`);

let lastWall = null;
for (const r of rows) {
    const f = r.frame;
    if (r.wall !== lastWall) {
        if (r.wall) console.log(`${r.wall}: ${pt(r.start, f)} -> ${pt(r.end, f)}, t ${r.thickness}, base ${r.base}; side A faces ${r.sideA}`);
        else console.log(`${r.id} (free-standing door), base ${r.base}; side A faces ${r.sideA}`);
        lastWall = r.wall;
    }
    console.log(`   ${r.id} ${r.type} ${r.swing}, ${r.width} x ${r.height} ${r.leafKind}; side A: ${r.roomAName}, side B: ${r.roomBName}`);
    console.log(`      jambs: start-side ${pt(r.jambs[0], f)}, end-side ${pt(r.jambs[1], f)}`);
    for (const l of r.leaves) {
        const room = l.opensTo === "A" ? r.roomAName : r.roomBName;
        const pivot = Math.abs(l.pivotOffset) < 0.0005 ? "on the centreline" : `${mm(Math.abs(l.pivotOffset))} toward side ${l.pivotOffset > 0 ? "A" : "B"}`;
        console.log(`      ${r.leaves.length > 1 ? `leaf ${l.leaf}: ` : ""}hinge ${pt(l.hingePoint, f)} at the ${l.hinge}-side jamb (pivot ${pivot}); opens to side ${l.opensTo} (${l.opensToward}) into ${room}`);
        console.log(`      leaf ${l.leafLength} x ${l.leafThickness}: at 90° from the hinge to ${pt(l.tip90, f)}; at ${r.fullAngleDeg}° tip ${pt(l.tipFull, f)} (${mm(l.tipPastJamb)} past the hinge jamb along the wall)`);
    }
}

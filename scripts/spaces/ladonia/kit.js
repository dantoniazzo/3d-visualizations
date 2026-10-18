/**
 * A building's spec, written in its own frame (metres, x east, z south, its
 * outside's north-west corner at the origin, as its plans are drawn) and
 * laid down on the site at an offset: walls by their centrelines, each
 * opening by where it starts and ends along the wall's main axis (x for a
 * wall running more east–west, z for one running more north–south), rooms
 * by their floor outlines, and the furniture by where each piece stands and
 * which way it faces. See .claude/skills/build-property-space/generator.md
 * (kit.js's `Building`) and buildings.md.
 */

const round = (n) => Math.round(n * 1000) / 1000;

/** Furniture faces north (-z) at 0°; these turn it to face the others. */
export const FACE = { N: 0, W: 90, S: 180, E: -90 };

export class Building {
    /**
     * @param {string} tag      prefix for every id
     * @param {[number, number, number?]} offset  where its origin lands on
     *   the site, and how high its ground floor stands (0 by default): every
     *   floor, wall, roof, stair and piece is written from its own ground
     *   floor and raised or lowered by it
     */
    constructor(tag, [ox, oz, oy = 0]) {
        this.tag = tag;
        this.ox = ox;
        this.oz = oz;
        this.oy = oy;
        this.out = { rooms: [], walls: [], roofs: [], stairs: [], floor_openings: [], furniture: [], spawns: [] };
        this.count = 0;
    }

    id(name) {
        return `${this.tag}-${name}`;
    }

    P(x, z) {
        return [round(this.ox + x), round(this.oz + z)];
    }

    /** A height in its own frame, on the site. */
    Y(y) {
        return round(this.oy + y);
    }

    /**
     * A wall from a to b (centreline). Side A, its `finish`, faces `outside`
     * (a point), or north/west by default; openings `{ at: [lo, hi], ... }`
     * along its main axis.
     */
    wall(name, a, b, { t = 0.12, base = 0, h = 3, finish = "limewash_warm", back = "limewash_warm", reveal = "trim_white", outside = null, openings = [] } = {}) {
        let start = this.P(...a);
        let end = this.P(...b);
        const dx = end[0] - start[0];
        const dz = end[1] - start[1];
        const o = outside ? this.P(...outside) : [start[0] + (Math.abs(dz) > Math.abs(dx) ? -1 : 0), start[1] + (Math.abs(dz) > Math.abs(dx) ? 0 : -1)];
        const mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
        // Side A is the left of start→end in plan (x right, z down): +z when
        // running east; turn the wall round if that is not the outside.
        const left = -dz * (o[0] - mid[0]) + dx * (o[1] - mid[1]);
        let flip = false;
        if (left < 0) {
            [start, end] = [end, start];
            flip = true;
        }
        const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
        const axis = Math.abs(dx) >= Math.abs(dz) ? 0 : 1;
        // Local coordinates of the wall's two ends along its main axis.
        const la = flip ? b[axis] : a[axis];
        const lb = flip ? a[axis] : b[axis];
        const along = (v) => ((v - la) / (lb - la)) * length;
        const list = openings
            .map(({ at, ...rest }, k) => {
                const [p, q] = at.map(along).sort((m, n) => m - n);
                return { id: this.id(`${name}-o${k}`), ...rest, offset: round((p + q) / 2), width: round(q - p) };
            })
            .sort((m, n) => m.offset - n.offset);
        widenDoors(list, length, this.id(name));
        this.out.walls.push({
            id: this.id(name),
            start,
            end,
            height: h,
            thickness: t,
            finish,
            finish_back: back,
            reveal,
            base_height: this.Y(base),
            openings: list,
        });
    }

    room(name, label, polygon, floor, { elevation = 0, h = 3, ceiling = "ceiling_warm", fitting = "recessed" } = {}) {
        const outdoor = !ceiling || ceiling === "none";
        this.out.rooms.push({
            id: this.id(name),
            name: label,
            polygon: polygon.map((p) => this.P(...p)),
            voids: [],
            floor_finish: floor,
            ceiling_finish: outdoor ? "none" : ceiling,
            height: outdoor ? 0.05 : h,
            elevation: this.Y(elevation),
            // Lit by its own spots and pendants: only a downlight of the house's.
            ...(outdoor ? {} : { fitting }),
        });
    }

    rect(x0, z0, x1, z1) {
        return [
            [x0, z0],
            [x1, z0],
            [x1, z1],
            [x0, z1],
        ];
    }

    flatRoof(name, x0, z0, x1, z1, base, { finish = "roof_membrane", overhang = 0.05, thickness = 0.25, soffit = "coping_grey" } = {}) {
        this.out.roofs.push({
            id: this.id(name),
            type: "flat",
            footprint: this.rect(x0, z0, x1, z1).map((p) => this.P(...p)),
            base_height: this.Y(base),
            ridge_height: this.Y(base + 0.3),
            finish,
            gable_finish: "render_sand",
            overhang,
            thickness,
            soffit,
        });
    }

    /** A straight flight: its foot's middle, the way it climbs (N/S/E/W), its width, from and to, how long. */
    stair(name, foot, climbs, { width = 1.0, base, top, run, steps, finish = "concrete_steps", riser = "trim_white", hole = null, style = null }) {
        const yaw = { N: 0, S: 180, E: 90, W: -90 }[climbs];
        this.out.stairs.push({
            id: this.id(name),
            start: this.P(...foot),
            direction: { N: "north", S: "south", E: "east", W: "west" }[climbs],
            yaw,
            width,
            base_height: this.Y(base),
            top_height: this.Y(top),
            run,
            steps,
            finish,
            riser,
            ...(style ? { style } : {}),
        });
        if (hole) {
            // The floor it climbs through, cut where it passes.
            const [x0, z0, x1, z1] = hole;
            const a = this.P(x0, z0);
            const b = this.P(x1, z1);
            this.out.floor_openings.push({
                id: this.id(`${name}-hole`),
                position: [round((a[0] + b[0]) / 2), round((a[1] + b[1]) / 2)],
                elevation: this.Y(top),
                width: round(Math.abs(b[0] - a[0])),
                depth: round(Math.abs(b[1] - a[1])),
                yaw: 0,
                stair_id: this.id(name),
                ...(hole[4] ? { rails: hole[4] } : {}),
            });
        }
    }

    /** A catalogue piece standing at (x, z) on a floor at `y`, facing `face` (FACE or degrees). */
    put(catalog, x, z, face = 0, y = 0, scale = 1) {
        const [px, pz] = this.P(x, z);
        this.out.furniture.push({
            id: this.id(`f${(this.count += 1).toString().padStart(3, "0")}`),
            catalog_id: catalog,
            position: [px, this.Y(y), pz],
            rotation: typeof face === "string" ? FACE[face] : face,
            scale,
        });
    }
}

/**
 * Every door wide enough to walk through: a visitor is a capsule 0.7 m
 * across, so a door or doorway under MIN_DOOR (read off a plan at 0.7–0.8 m)
 * is widened about its middle — kept inside its wall and clear of the
 * openings either side of it, shifted along if need be. One that cannot be
 * is left as it is and named in `Building.narrowDoors`.
 */
export const MIN_DOOR = 0.9;
const DOOR_GAP = 0.1;
export const narrowDoors = [];
function widenDoors(list, length, wallId) {
    list.forEach((o, k) => {
        if (o.fit) return void delete o.fit;
        if (!/door/.test(o.type) || o.width >= MIN_DOOR) return;
        // Room either side: a hand's width to the next opening or the
        // wall's end, or at a pinch the jamb's own (a short wall by a corner).
        const room = (gap) => [
            (k > 0 ? list[k - 1].offset + list[k - 1].width / 2 : 0) + gap,
            (k < list.length - 1 ? list[k + 1].offset - list[k + 1].width / 2 : length) - gap,
        ];
        let [lo, hi] = room(DOOR_GAP);
        if (hi - lo < MIN_DOOR) [lo, hi] = room(0.04);
        if (hi - lo < MIN_DOOR) {
            narrowDoors.push(`${wallId} ${o.width} m (room for ${round(hi - lo)})`);
            return;
        }
        const centre = Math.min(Math.max(o.offset, lo + MIN_DOOR / 2), hi - MIN_DOOR / 2);
        o.offset = round(centre);
        o.width = MIN_DOOR;
    });
}

// Openings.
const SLIM = { frame: "frame_bronze", style: "slim" };
/** A window: `h` tall from `sill`, an external blind lowered by `blind`. */
export const win = (lo, hi, { h = 1.5, sill = 0.9, blind = 0.5, panes } = {}) => ({
    at: [lo, hi],
    type: "window",
    height: h,
    sill,
    ...SLIM,
    panes: panes ?? [Math.max(1, Math.round((hi - lo) / 1.2)), 1],
    ...(blind == null ? {} : { blind }),
});
/** Fixed glazing, floor to head. */
export const glazing = (lo, hi, { h = 2.45, blind = null } = {}) => win(lo, hi, { h, sill: 0.02, blind, panes: [Math.max(1, Math.round((hi - lo) / 1.3)), 1] });
/** A glass sliding door. */
export const slider = (lo, hi, { h = 2.45, blind = null } = {}) => ({
    at: [lo, hi],
    type: "door",
    height: h,
    sill: 0,
    style: "slim",
    ...(blind == null ? {} : { blind }),
    door: { type: "sliding", swing: "inward_left", leaf: "frame_bronze", frame: "frame_bronze", handle: "metal_black", glazed: true },
});
/** A front door: a flush dark-bronze slab. */
export const entry = (lo, hi, { swing = "inward_right", h = 2.3 } = {}) => ({
    at: [lo, hi],
    type: "door",
    height: h,
    sill: 0,
    door: { type: "hinged", swing, leaf: "frame_bronze", frame: "frame_bronze", handle: "metal_black", flush: true },
});
/** A door inside: a flush oak slab on concealed hinges. */
export const door = (lo, hi, { swing = "inward_right", leaf = "trim_oak", fit = false } = {}) => ({
    at: [lo, hi],
    type: "door",
    height: 2.1,
    sill: 0,
    door: { type: "hinged", swing, leaf, frame: "trim_white", handle: "metal_black", flush: true },
    // `fit`: as wide as given, the walls across its wall's ends leaving no more.
    ...(fit ? { fit } : {}),
});
/** A glazed hinged door. */
export const glassDoor = (lo, hi, { swing = "outward_right", h = 2.3 } = {}) => ({
    at: [lo, hi],
    type: "door",
    height: h,
    sill: 0,
    style: "slim",
    door: { type: "hinged", swing, leaf: "frame_bronze", frame: "frame_bronze", handle: "metal_black", glazed: true },
});
export const doorway = (lo, hi) => ({ at: [lo, hi], type: "doorway", height: 2.1, sill: 0 });

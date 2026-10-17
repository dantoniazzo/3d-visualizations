import { REACH, pickTarget } from "../../../shared/interact.js";

/**
 * Everything the visitor can act on, and how: the one picker behind the
 * crosshair, the prompt and the action keys (Player.js), in the editor's
 * walkthrough and a public view alike.
 *
 * Each kind of thing is a provider, with a `name` ("door", "car"…), and
 * every provider answers the same few questions:
 *
 *   aim(ray, look)    what of its kind the crosshair's ray meets: candidates
 *                     `{ kind, id, distance, ref, label }`, at their distance
 *                     along the ray. `look` is what Player's own look ray has
 *                     already found — `hit` (the first thing met, or null),
 *                     `sight` (how far the ray sees), `far`, `head` — so a
 *                     kind that is part of the scene (a door's leaf, a drawer)
 *                     is read off `hit` and costs no ray of its own; one that is
 *                     not (a light's box, later a seat's point) is met by its
 *                     own test. Which candidate is aimed at is shared/
 *                     interact.js's pickTarget: within its kind's reach, not
 *                     behind what the ray met first, the nearest — within 5 cm,
 *                     the more particular.
 *   seated(seat, eye, player)  optional: what of its kind is offered to
 *                     someone sitting on `seat` (World/Seats.js), their eyes
 *                     at `eye` — a television in front of it (World/
 *                     Screens.js) — as a candidate, or null. Seated, nothing
 *                     is aimed at: Player.seatedOffer asks every provider,
 *                     and with none to offer, E gets them up.
 *   near(head)        optional: what of its kind is within reach of the head
 *                     without being aimed at. `first` providers' (a car's) are
 *                     offered before anything aimed at; the others' (the
 *                     nearest door) only when nothing is.
 *   of(ref)           optional: one thing of its kind's, as a candidate,
 *                     picked some other way than by aim or reach — a car
 *                     clicked from above.
 *   prompt(target)    what the prompt says for it: `{ label, key, touch: {
 *                     label, icon } }` — the touch screen's button's word and
 *                     its icon (styles/components/hud.scss) — and, optionally,
 *                     `also: { key, label }`, what another key does there,
 *                     said after it on a keyboard (frontend/index.js's
 *                     #action-also): seated before a television, "Space
 *                     Stand up".
 *   act(target, player)  do it; `{ kind, id, state }`, which Player tells the
 *                     world of ("interact").
 *   busy()            optional: the name of what it is still moving, for the
 *                     editor's frames on demand (Pace.js), or null.
 *   refresh()         optional: look again at what there is, after the
 *                     furniture has come or the scene has been edited.
 *   dispose()         optional.
 *
 * Doors, the furniture's doors and drawers, the windows, the lights and the
 * cars are built in; the rest is `register`ed by its own module — seats
 * (World/Seats.js, "seat") and televisions (World/Screens.js, "tv"), and
 * later taps and showers — and Player is not touched for it. A candidate may carry
 * its own `reach`, `slack` and `priority` where its kind's (shared/
 * interact.js) do not suit it.
 *
 * The state of what is acted on is the visitor's own: doors, drawers,
 * windows and lights start as they were published and are never saved or
 * shared.
 */
export default class Interactables {
    /**
     * @param {World} world  whose builder, switches and scope the built-in kinds read as they are asked
     */
    constructor(world) {
        this.world = world;
        this.providers = [];

        for (const provider of [doorProvider(world), openableProvider(world), windowProvider(world), lightProvider(world), carProvider(world)]) {
            this.register(provider);
        }

        // What there is to act on, looked at again as the scene changes (a provider that keeps a list of its own).
        this.onChange = () => {
            for (const provider of this.providers) provider.refresh?.();
        };
        for (const name of ["furniture-ready", "scene-edited", "fittings-rebuilt"]) world.on(name, this.onChange);
    }

    /**
     * Take on a kind of thing to act on.
     *
     * @param {object} provider  as the class's comment says; `name` names it
     * @returns {Function}  what lets it go again
     */
    register(provider) {
        this.providers.push(provider);
        return () => {
            this.providers = this.providers.filter((entry) => entry !== provider);
            provider.dispose?.();
        };
    }

    /**
     * What the crosshair is on, of all there is to act on.
     *
     * @param {THREE.Ray} ray  the crosshair's, from the head
     * @param {{ hit: object|null, sight: number, far: number, head: THREE.Vector3 }} look  what Player's look ray found
     * @returns {object|null}  the candidate aimed at, its `provider` with it
     */
    aim(ray, look) {
        const candidates = [];
        for (const provider of this.providers) {
            const found = provider.aim?.(ray, look);
            if (!found) continue;
            for (const candidate of found) {
                candidate.provider = provider;
                candidates.push(candidate);
            }
        }
        return candidates.length ? pickTarget(candidates, look.sight) : null;
    }

    /**
     * What is on offer, for the prompt: a car within reach first — the more
     * particular thing to be standing beside — then whatever is aimed at,
     * then the nearest door.
     *
     * @param {object|null} aimed  aim's answer
     * @param {THREE.Vector3} head
     */
    offer(aimed, head) {
        for (const provider of this.providers) {
            if (!provider.first || !provider.near) continue;
            const candidate = provider.near(head);
            if (candidate) return withProvider(candidate, provider);
        }
        return aimed ?? this.nearby(head);
    }

    /** What the action key acts on with nothing aimed at: the nearest door, as it always was. */
    nearby(head) {
        for (const provider of this.providers) {
            if (provider.first || !provider.near) continue;
            const candidate = provider.near(head);
            if (candidate) return withProvider(candidate, provider);
        }
        return null;
    }

    /** The named kind's nearest within reach of the head (`near`), aimed at or not: the car F gets into. */
    nearest(name, head) {
        const provider = this.providers.find((entry) => entry.name === name);
        const candidate = provider?.near?.(head);
        return candidate ? withProvider(candidate, provider) : null;
    }

    /** The car being driven, as something to act on: what the prompt offers at the wheel (getting out). */
    driving(car) {
        const provider = this.providers.find((entry) => entry.name === "car");
        if (!provider || !car) return null;
        return withProvider({ kind: "car", id: car.spec.id, ref: car, label: carLabel(car), driving: true }, provider);
    }

    /**
     * One thing of the named kind as something to act on, however far off —
     * picked some other way than by reach: the car clicked or tapped from
     * above (World/BirdView.js). Null where its kind cannot say (`of`).
     */
    of(name, ref) {
        const provider = this.providers.find((entry) => entry.name === name);
        const candidate = ref && provider?.of?.(ref);
        return candidate ? withProvider(candidate, provider) : null;
    }

    /** What the prompt says for a target: `{ label, key, touch: { label, icon } }`. */
    prompt(target) {
        return target?.provider.prompt(target) ?? null;
    }

    /** Act on a target; what it did, `{ kind, id, state }`, or null. */
    act(target, player) {
        return target?.provider.act(target, player) ?? null;
    }

    /** The name of the first thing still moving by itself, or null (Pace.js). */
    busy() {
        for (const provider of this.providers) {
            const name = provider.busy?.();
            if (name) return name;
        }
        return null;
    }

    dispose() {
        for (const name of ["furniture-ready", "scene-edited", "fittings-rebuilt"]) this.world.off(name, this.onChange);
        for (const provider of this.providers) provider.dispose?.();
        this.providers = [];
    }
}

function withProvider(candidate, provider) {
    candidate.provider = provider;
    return candidate;
}

/** What a car is called, for a label (its group's: Vehicle/Car.js). */
function carLabel(car) {
    return car.group.userData?.label ?? "Car";
}

/**
 * The doors in the walls: the leaf aimed at (a door's group anywhere up from
 * what the ray met), or the nearest within 2.2 m across the floor, on the
 * visitor's own floor (SceneBuilder.nearestDoor), so a door stood beside
 * opens without being aimed at — not one upstairs or downstairs from it.
 */
function doorProvider(world) {
    const state = (door) => (door.isOpening ? "open" : "shut");
    return {
        name: "door",
        aim(ray, look) {
            let node = look.hit?.object;
            while (node && node.userData?.kind !== "door") node = node.parent;
            const door = node?.userData?.door;
            if (!door) return null;
            return [{ kind: "door", id: node.userData.id, distance: look.hit.distance, ref: door, label: door.isOpen ? "Open door" : "Closed door" }];
        },
        near(head) {
            const door = world.sceneBuilder?.nearestDoor(head, REACH.doorNear);
            return door ? { kind: "door", id: door.spec.id, distance: null, ref: door, label: door.isOpen ? "Open door" : "Closed door" } : null;
        },
        prompt({ ref: door }) {
            // Which way it will go: Open to Close the moment it is opened, not once it has swung.
            return {
                label: door.isOpening ? "Close door" : "Open door",
                key: "E",
                touch: { label: door.isOpening ? "Close" : "Open", icon: "door" },
            };
        },
        act({ ref: door, id }) {
            const opened = door.toggle();
            world.emit("door", { door, opened });
            return { kind: "door", id, state: state(door) };
        },
    };
}

/**
 * The furniture's doors and drawers (Openables.js): the part the ray met, or
 * is part of — a door's handle is its door's — within 2.5 m, named as its
 * model names it ("Open fridge", "Close wardrobe", "Open detergent drawer"),
 * else a door or a drawer, as it always was; its touch button a drawer's or
 * a door's. In a public view its piece collides as the rest of it and a box
 * for each such part, shut — or as its box, shut, a handle's depth in front
 * of it (SceneBuilder.collisionOf) — and Player's look ray lets the piece's
 * own parts be aimed at through either.
 */
function openableProvider(world) {
    return {
        name: "openable",
        aim(ray, look) {
            const openables = world.sceneBuilder?.openables;
            const part = look.hit && openables?.of(look.hit.object);
            if (!part) return null;
            // (A piece with a light inside it — a fridge — about to be opened: the shaders for its light built ahead, so it
            // lights up as its door swings: Openables.warm.)
            openables.warm?.(part);
            let owner = look.hit.object;
            while (owner && !owner.userData?.label) owner = owner.parent;
            return [{ kind: "openable", id: part.node.uuid, distance: look.hit.distance, ref: part, label: owner?.userData?.label ?? part.label }];
        },
        prompt({ ref: part }) {
            const word = part.isOpening ? "Close" : "Open";
            return {
                label: `${word} ${part.label}`,
                key: "E",
                touch: { label: word, icon: part.kind === "drawer" ? "drawer" : "door" },
            };
        },
        act({ ref: part, id }) {
            const opened = part.toggle();
            world.emit("openable", { part, opened });
            return { kind: "openable", id, state: opened ? "open" : "shut" };
        },
        busy() {
            return world.sceneBuilder?.openables.busy() ?? null;
        },
    };
}

/**
 * The windows that open (World/Sash.js): the sash the look ray met — its
 * frame, its glass or its handle — or the hole a pane fills, by each
 * window's own test of the ray (`through`): turned in, a sash stands edge
 * on in the room, and the ray goes on through its opening to the invisible
 * pane outside it, which a public view has in its collision tree alone.
 * Within 2 m, and from the room's side only: a window opens inwards, by its
 * handle, and is not opened from the garden. The prompt says what pressing
 * will do — "Open window" where the sash turns in, "Tilt window" where
 * something stands in the way of its turning (WindowSash.plan, from the
 * collision trees round it, looked at once for the trees as they stand),
 * "Close window" — and its touch button has the window's icon.
 */
function windowProvider(world) {
    // (Named as what it is, not as it stands: the label is told as what is aimed at changes, not as the sash moves.)
    const candidate = (sash, distance) => ({ kind: "window", id: sash.id, distance, ref: sash, label: "Window" });
    return {
        name: "window",
        aim(ray, look) {
            const windows = world.sceneBuilder?.windows;
            if (!windows?.length) return null;
            const found = [];
            let node = look.hit?.object;
            while (node && !node.userData?.sash) node = node.parent;
            const met = node?.userData.sash ?? null;
            if (met?.inside(look.head)) found.push(candidate(met, look.hit.distance));
            for (const sash of windows) {
                if (sash === met) continue;
                const distance = sash.through(ray, REACH.window);
                if (distance !== null) found.push(candidate(sash, distance));
            }
            return found.length ? found : null;
        },
        prompt({ ref: sash }) {
            // (Caught on its way shut, pressing opens it again the way it was going.)
            const way = sash.open > 0.001 && sash.mode ? sash.mode : sash.plan(world.collision);
            const word = sash.isOpening ? "Close" : way === "tilt" ? "Tilt" : "Open";
            return { label: `${word} window`, key: "E", touch: { label: word, icon: "window" } };
        },
        act({ ref: sash, id }) {
            const state = sash.toggle(world.collision);
            world.emit("window", { sash, state });
            return { kind: "window", id, state };
        },
        busy() {
            for (const sash of world.sceneBuilder?.windows ?? []) if (sash.isMoving) return "window";
            return null;
        },
    };
}

/**
 * The lights, and their switches on the wall, where there are switches to
 * turn (World/Switches.js, LiveSwitches.js): an invisible box round each
 * (SceneBuilder.buildLightTargets), met by a ray of its own. In the editor's
 * view of the surroundings alone (World/Scope.js) only a lamp whose piece is
 * drawn: the rooms' lights are not there.
 */
function lightProvider(world) {
    return {
        name: "light",
        aim(ray, look) {
            const builder = world.sceneBuilder;
            if (!world.switches || !builder) return null;
            const scope = world.scope;
            const accept = scope && !scope.interior ? ({ fixture }) => Boolean(fixture && builder.furniture.get(fixture)?.group.visible) : undefined;
            const light = builder.pickLight(ray, { far: look.far, accept });
            return light ? [{ kind: "light", id: light.id, distance: light.distance, ref: light, label: light.label }] : null;
        },
        prompt({ ref: light, id }) {
            const on = world.switches?.isOn(id);
            return {
                label: `${on ? "Turn off" : "Turn on"} ${light.name}`,
                key: "E",
                touch: { label: on ? "Off" : "On", icon: "light" },
            };
        },
        act({ id }) {
            const switches = world.switches;
            if (!switches) return null;
            const on = !switches.isOn(id);
            // (A baked view's light is shown on at once and lit once its lightmap is here: Switches.set.)
            switches.toggle(id);
            return { kind: "light", id, state: on ? "on" : "off" };
        },
    };
}

/**
 * The cars, on their own key (F): offered whenever one is within 3.4 m of its
 * middle, before anything aimed at. None while the editor's view leaves the
 * cars out (SceneBuilder.nearestCar). From above, any car on the floor shown
 * is got into by a click or a tap on it as well (`of`: World/BirdView.js).
 */
function carProvider(world) {
    const of = (car) => ({ kind: "car", id: car.spec.id, distance: null, ref: car, label: carLabel(car) });
    return {
        name: "car",
        first: true,
        near(head) {
            const car = world.sceneBuilder?.nearestCar?.(head, REACH.car);
            return car ? of(car) : null;
        },
        of,
        prompt(target) {
            const label = target.driving ? "Get out" : "Drive";
            return { label, key: "F", touch: { label, icon: "car" } };
        },
        act(target, player) {
            if (target.driving) {
                player.exitVehicle();
                return { kind: "car", id: target.id, state: "parked" };
            }
            player.enterVehicle(target.ref);
            return { kind: "car", id: target.id, state: player.inVehicle ? "driving" : "parked" };
        },
    };
}

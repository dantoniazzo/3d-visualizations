/**
 * Which car a scene's vehicle is: the id of one of the models in
 * public/models/cars/index.json, which `npm run models -- --cars` builds from
 * assets/cars/cars.json. A vehicle that names none is the default — the one
 * cars.json names too.
 */
export const DEFAULT_CAR = "bmw-x6-m";

/** A car id as the files are named: lower-case words joined by hyphens. */
export function carId(value) {
    const id = typeof value === "string" ? value.trim().toLowerCase() : "";
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length <= 64 ? id : DEFAULT_CAR;
}

/**
 * The layer a real mesh of the editor's scene is on while a stand-in draws
 * in its place (World/StandIns.js): its own layer 0 is given up for it, so
 * that no camera draws the mesh — every camera looks at layer 0 — and it is
 * put back the moment the mesh draws itself again. Nothing else of the mesh
 * changes: it is still `visible`, still in the scene, with its materials.
 *
 * three tests a ray against an object by the ray's own layers, so whatever
 * asks the scene a question with a Raycaster — a click, the crosshair, a
 * piece looking for what is under it, the camera's boom — must look at this
 * layer as well as its own (`seeReal`), or it passes through everything a
 * stand-in draws. Any new Raycaster that meets the house or its furniture in
 * the editor needs the same.
 */
export const REAL_LAYER = 12;

/** A raycaster that meets the scene as it is built, whichever of it stand-ins draw. */
export function seeReal(raycaster) {
    raycaster.layers.enable(REAL_LAYER);
    return raycaster;
}

# The pool's water (`World/Builders/LandscapeBuilder.js`, poolWater)

Since wave C of 2026-10-16. Until then the water was an opaque milky
turquoise (MeshPhysicalMaterial, opacity 0.78) that hid the new steps in
every realistic view. Now it is clear: the mosaic, the steps and anyone
swimming show through it, turquoise deepening with the depth, as in the
listing's render 15.

- **Two passes over one quad**, with no refraction framework
  (`../build-property-space/light-and-look.md`, §7: no refractive glass).
  - The **depth pass** (a ShaderMaterial on the helper child mesh
    "pool-water-depth": `helper`, never picked, collided, merged, baked or
    published; `treatAsOpaque`, so N8AO's transparency pictures leave it
    out; no raycast) multiplies what is already drawn under the surface by
    the water's transmittance: `exp(−ABSORB (0.30, 0.06, 0.045)/m × (look
    path + depth) − 0.12/m × look path)`, times the caustics. It blends
    DstColor × SrcColor (2·src·dst), its factor written halved in the
    output colour space, so that a caustic can brighten as well as dim.
  - The look path is refracted (1/1.333) and found analytically against
    the pool's box, then each tread's block, tried only when the look
    passes through the steps' box. No depth buffer is read: a fragment
    cannot read the depth of the frame it is drawn into.
  - The **surface** (MeshPhysicalMaterial "pool_water", onBeforeCompile)
    has an alpha of the Schlick Fresnel reflectance (F0 0.02), and its
    light is added on top (CustomBlending One / OneMinusSrcAlpha): the
    sky's reflection, rippled as before, and the water body's own glow,
    BODY (linear 0.05, 0.26, 0.28) × (1 − e^(−0.5/m × look path)) ×
    (1 − F). Fog is premultiplied.
  - While the map is the bare sky (`uHorizon`; a probe already sees them),
    below about 17° the reflection is the surroundings instead,
    SURROUND (0.2, 0.19, 0.15) × three's own irradiance sample / π: the
    far end does not go white.
  - Neither pass writes depth. N8AO's occlusion is the basin's; the water
    is in its "open" picture with alpha F.
  - From below (the camera under the surface) the underside is drawn as
    before: #6fc6c9 × (0.42, 0.78, 0.86), alpha 0.93, one pass by
    `gl_FrontFacing`, nothing compiled again.
  - **Order**: the depth pass is a child of the surface, made before it,
    and so drawn first — three sorts two see-through things at one
    distance by their ids. Made the other way round, the multiply would
    land on the reflection. Up to 12 treads are read (`MAX_TREADS`, the
    shaders' loop; `poolSteps` gives no more).
  - The depth pass carries a `raycast` of its own (`under.raycast = () =>
    {}`), against "Never give a scene object a property of its own"
    (`../app-testing-and-performance/speed-architecture.md`): one mesh a
    pool, in every view; not measured. The surface has none.
- **Built live in every view** from the spec's pools (`poolWater`, in the
  landscape's live group), never baked. A public view drops the runtime
  file's own "pool-water" from its see-through group
  (`SceneBuilder.addRuntimeGlass`), so a change to the water's look
  reaches every published version with a build alone (the user's 12 Oct
  version shows the clear water). The steps are `decor` of the static
  house and need a publish and a bake.
- **Caustics**: two Voronoi-edge nets, one of 0.34 m cells and one of
  0.23 m turned 0.7 rad, drifting across each other and bent a little,
  both read from one seeded 256² tile (`poolNet`, 8×8 cells, made once a
  page in about 11 ms; worked out per pixel they cost 0.3 ms more).
  - They sit where the sun's refracted ray came in through the surface,
    sharper deeper down; none where that ray came in over the coping (the
    walls shade it) or where a pixel spans more than 1.5–6 cm.
  - Their mean is about 0: they move light about rather than add it.
  - Strength 0.9 × the sun's intensity / 3; none at night, under the plain
    light, or with the sun hidden.
  - They are a tiled pattern, not traced from the ripples, and of the
    shadows they know only the pool's own walls'.
- **Roughness 0.12**, not 0.04: reflections.js gives every transparent
  material of roughness ≤ 0.1 its studio (RoomEnvironment) to mirror, and
  the old water mirrored that studio, not the sky (the white blotches on
  it were its softboxes). Over 0.1, Sky.share's own water branch gives it
  the sky, or a probe. Keep it over 0.1.
- **Night**: the emissive is #1fa9c4 × 0.7 (1.4 on the opaque water),
  scaled by the depth of the look; the bake's lit basin shows through.
  1.4 washed the steps into a white-blue sheet.
- `updatePoolWater(live, delta, { sun, plain })`, from Flora each frame,
  moves the time, the sun's direction and strength and `uHorizon`;
  `lightPoolWater(live, night)` sets the glow. Every pool's water, not
  only the first.
- **What it is not**: the deck and the house are not truly mirrored (a
  planar reflection would be a second render of the scene); a swimmer's
  body is dimmed by the path to the basin behind it, not to the body (it
  reads a little too turquoise near the surface, the floor's caustics on
  it); live shadows of people and loungers darken the surface's body glow
  fairly strongly in full sun. The water's two programs build the first
  time the pool is seen, as the old water's did; they are not built ahead.
- **Measured** (GPU timer, public view, step 4, 2048×1536, the water shown
  against hidden in the same tab, not under the baton):

  | pose | old water, 12 Oct version | new water, 12 Oct version | new water, new version (steps) |
  |---|---|---|---|
  | B-verify's pool spot | 0.13 ms | 0.19 | 0.15 |
  | deck → steps | 0.15 | 0.19 | 0.25 |
  | along the pool (half the view) | 0.32 | 0.56 | 0.50 |
  | from above | 0.08 | 0.14 | 0.16 |

  About +0.05–0.1 ms over the old water with the pool in part of the
  view, +0.15–0.2 ms with it filling half. The CPU's share is one draw
  call more and a few vector operations a frame. Wave C's timing of the
  12 Oct version on this build against the build before
  (`../app-testing-and-performance/speed-architecture.md`, what runs every
  frame) includes it.

## Elsewhere

- The look rules this follows (no refractive glass; the pool water clear,
  the turquoise first pass from the pool's box and steps, Fresnel alpha,
  roughness over 0.1 — an opacity of 0.78 hid the steps):
  `../build-property-space/light-and-look.md` (§7). A new space's pool
  water keeps a roughness over 0.1.
- Three pitfalls found here (reflections.js' studio for roughness ≤ 0.1;
  no depth read in a fragment shader; a multiply pass through
  `linearToOutputTexel`): SKILL.md, Pitfalls.
- The water is built live in every view, never baked, and the runtime's
  own "pool-water" is dropped: `../baked-view-lighting/baked-drawing.md`
  (with the view's reflections; tone mapping:
  `../baked-view-lighting/tone-ao-colour.md`). The steps need a publish
  and a bake; the water's look reaches every version with a build alone:
  `../publish-and-bake/publishing.md`.
- The depth pass's own `raycast`, a known exception to "never give a scene
  object a property of its own": `../app-testing-and-performance/speed-architecture.md`.
- The tools that looked at it (`pool-look.js`, the GPU timer `gtime.js`):
  `../app-testing-and-performance/`; how it was timed:
  `../app-testing-and-performance/measuring.md`.

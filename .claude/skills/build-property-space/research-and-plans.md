# Research the listing; measure the plans

The first two steps of a new space, read-only (SKILL.md, "Starting a new
space", steps 1–2). Ladonia's values are examples.

## 1. Research the listing first, exhaustively

Never build from the first image alone. Gather everything before modelling:

1. **Fetch the page in the in-app browser** (WebFetch misses JS-rendered
   galleries). Decline non-essential cookies.
2. **Find the JSON API** the page calls (`read_network_requests`, or
   `performance.getEntriesByType("resource")` filtered by `/api/`). For
   konekt-nekretnine.hr:
   - `/api/v1/real-estate-project-listings/<id>` — project, gallery
   - `/api/v1/real-estate-project-listings/<id>/buildings`
   - `/api/v1/real-estate-project-listings/floor-listings/<id>?buildingId=<b>&fillEmptyFloors=false`
     — per floor: the blueprint (`floorGroupPlanS3ImageLink`), unit
     polygons, net areas, bedrooms, bathrooms, toilets
   - `/api/v1/real-estate-project-listings/<id>/apartments?page=0&size=50`
   The per-unit `additionalRealEstateDetails.images` are exterior renders,
   not plans. Read the unit list (code, rooms, m²) for the flat count per
   building before modelling: Ladonia has 5 per building (1–3 ground, 4–5
   upstairs), not the 4 first guessed.
3. **Download everything** with `curl -A "Mozilla/5.0"` into
   `<scratch>/<project>/`: `gallery/<n>.jpg` in the listing's gallery order
   (views and blind pairs key on these numbers), `plans/<building>-<floor>.png`,
   `units/`, `api/*.json`. Keep them out of the repo (the listing's
   copyright). Convert WebP to JPEG with sharp to view them. Sites that
   block curl open in the in-app browser; developers' and architects' press
   kits have the best images. (The scratch folder does not survive a
   restart: keep a copy under `~/.claude/projects/<project>/<session>/snapshots/`,
   `../app-testing-and-performance/test-servers.md`.)
4. **Read every image at full size.** Per building: massing, storeys,
   materials and colours, window types and positions, pergolas, roofs,
   stairs, planting, parking, interiors (kitchen colours, floors, furniture
   models, lighting, textiles), terraces and their furniture.
5. **Note which building is which** (Ladonia: A and B share a plan, B has
   the pool; C differs). Build each, don't average them.
6. **Go round every building's surroundings** in every exterior and drone
   view — roads, lanes, kerbs, ground levels — not just the main street, and
   draw them on the site plan. Ladonia's refs 12 and 14 show a lane at
   street level beside C; C was built a metre up behind a wall until the
   user asked for it lowered.
7. When measuring from photos or plans, trace the whole element with its
   dark frames and borders, not just the clear glass.

## 2. Measure the plans

- Scale each floor image on its own, from things of known size, and
  cross-check two ways (a unit's net area against its pixel area, a door
  leaf 0.80–0.90, a WC 0.40 × 0.70). Don't assume the bed: Ladonia's
  Croatian plans draw 1.80 × 2.00 doubles in A and B but 1.4–1.5 × 1.9 in
  C, whose small squares either side of the head are nightstands, not part
  of the bed (an auditor read them as bed and got 1.85). Look at the crop
  yourself where two readings disagree. Scales there: A/B ground 28.3,
  first 40.6, roof 38.0; C ground 29.75, first 50.4 px/m (not the nominal
  50). Each sheet has its own: B's own ground sheet is 29.4. Origins and
  scales per sheet: `briefs.md`, shared context block.
- Overlay a pixel grid (sharp + SVG, `gridcrop.mjs` in this folder) and
  read wall lines off it; `scripts/plans/trace-walls.mjs <plan> <px/m>
  <out> --crop … --min 3` is a ruler only (it also traces wardrobes). Read
  windows from per-wall strips (each outside wall cropped, turned level,
  gridded at 2–3×). Record walls, openings and furniture in a measured JSON
  before writing the spec.
- The roof plan says what is on the roof terraces — model it, unless the
  renders disagree (renders win).
- Plans draw doors narrower than a walker fits (Ladonia's 0.55–0.85 m) and
  rooms tighter than their furniture: read them, then check them walking
  (`walkable.md`).

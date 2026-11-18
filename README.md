# Overpopulation Beach

A proof of concept for the art tool described in
[overpopulation-drawing-idea.md](overpopulation-drawing-idea.md) and
[overpopulation-beach-plan.md](overpopulation-beach-plan.md). It builds a crowded beach of posed 3D people
and compiles it into a physical pen-plotter SVG in millimetres.

```
settings ─► scene compiler ─► validated scene snapshot ─► drawing compiler ─► SVG + report
            (place, fit,        (versioned JSON, final        (contours, hidden-line
             accommodate,        numerical poses)              removal, strokes)
             validate)                 │
                                       └─► interactive Three.js preview
```

## Quick start

```bash
npm install
npm run dev            # studio at http://localhost:5173
npm run render -- --population 1000 --seed 3 --out out/beach   # headless: scene.json + svg + report.json
```

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `preview` | Vite app |
| `npm run render -- [--population N --seed S --crowding 0..1 --paper A3/A2/A1 --elevation deg --no-details --out path]` | Headless pipeline (tsx) |
| `npm run render -- --lab <posture\|all> [--blend <posture>] --count N` | Pose lab sheet: a gallery of generated poses, or an in-between strip |
| `npm test` / `test:watch` / `test:coverage` | Vitest unit + component tests |
| `npm run test:e2e` | Playwright smoke test (dev server on port 5317) |
| `npm run typecheck` / `lint` | TypeScript project build, ESLint |
| `npm run doctor` | React Doctor (vendored `src/components/ui` is excluded in `react-doctor.config.json`) |
| `npm run check` | typecheck + lint + unit tests |

## Layout

```
src/
  core/                 framework-free pipeline (TypeScript + three.js math); runs in browser, worker and Node
    math/               seeded RNG streams, segment distance, RDP simplification
    mesh/               surface nets polygonisation, edge topology, vertex normals
    body/               parametric organic bodies: params, anatomical primitives, implicit field,
                        skin weights, dual-quaternion skinning, fitted collision capsules, feature fields
    assets/             canonical skeleton (semantic bone names)
    poses/              procedural pose generator: archetypes, limb modes, two-bone IK, FK, blending
    motifs/             authored interaction groups (posture + limb intentions)
    constraints/        joint limits, capsule proxy collision world
    synthesis/          composition fields, placement, root fitting, pose accommodation
    validation/         independent per-person acceptance pass + contact relationships
    camera/             orthographic print camera → paper mm projection
    contours/           smooth contours + feature curves, environment lines
    visibility/         projected-triangle grid + analytic hidden-interval solver
    strokes/            chaining, cropping, protected simplification, travel ordering
    export/             SVG writer, plot-time estimate, versioned snapshot I/O
    lab/                pose lab sheets (gallery / in-between)
    pipeline/           compileDrawing (snapshot → strokes), previewBatch (snapshot → batched mesh)
    index.ts            public API used by the app, worker and scripts
  workers/              pipeline worker + client (progress, cancellation; caches body assets)
  preview/              CrowdPreview: batched Three.js renderer with picking and diagnostic colouring
  app/                  React UI (state reducer, hook, crowd + lab panels) built with shadcn/ui
  components/ui/        shadcn components (generated; edit via `npx shadcn add`)
scripts/render.ts       headless CLI
e2e/                    Playwright tests
```

Plan module → code: assets `core/body` + `core/assets`, poses `core/poses`, synthesis `core/synthesis`, constraints
`core/constraints`, validation `core/validation`, preview `src/preview`, contours `core/contours`, visibility
`core/visibility`, strokes `core/strokes`, export `core/export`.

## What the POC does today

### Organic bodies (`core/body`)

A body is defined by five continuous parameters: height, mass, muscle, femininity and child. They drive
about 50 anatomical primitives attached to the skeleton: tapered limbs, and ellipsoids for buttocks,
belly, chest, breasts, calves, deltoids, head and hands.

- **Surface.** The primitives are smooth-min blended within the trunk and within each limb. Each limb
  is smoothly attached to the trunk, but limbs are only hard-unioned with each other, so thighs or an
  arm resting against the side never fuse.
- **Mesh.** The field is polygonised once per body with surface nets in an A-pose. Vertices are
  projected back onto the iso-surface.
- **Rig.** The mesh is skinned with distance-based weights and posed with dual-quaternion skinning.
- **Collision.** Capsules are fitted to the surface (asymmetric, 97th percentile) and used for
  collision, support and ground checks.
- **Body bank.** Each scene builds a bank of distinct bodies (`bodyVariety`). Assets are cached per
  body and resolution in the worker.
- **Feature curves.** Swimwear (trunks, shorts, bikini, swimsuit) and the hairline are level sets of
  rest-pose scalar fields, so they follow the body through any pose.

### Procedural poses (`core/poses`)

A pose is not picked from a list. It is generated:

1. **Posture archetype.** There are seven: lying on back, front or side, sitting, reclining, kneeling
   and standing. Each samples a root orientation, spine bend and twist, head direction and a ground
   rule.
2. **Limb modes.** Each limb picks a weighted mode, for example propped behind, hand on belly, behind
   the head, hugging knees, cross-legged, knee up, kneeling or step. A mode gives a continuous target
   and pole, often relative to body landmarks, the ground or the other limbs.
3. **IK.** Analytic two-bone IK places the elbow or knee. Hands and feet are oriented: flat on the
   ground, palm down, pointed or relaxed.
4. **Settle.** Lying bodies are tilted until both the hip and the shoulder contacts touch the sand.
5. **Checks.** Joint limits (with a direction cone for shoulders), required ground supports and limb
   self-collision. Failed samples are rejected and redrawn.

The pose description (`PoseParams`) is a vector of numbers in [0, 1]. That gives three operations:

- **Sampling** produces an unbounded family of valid poses.
- **Mutation** reshapes a pose continuously. The crowd fitter uses this for accommodation: it mutates
  exactly the limbs that collide with neighbours.
- **Blending** interpolates two poses in goal space (root, spine, IK targets, poles, hand and foot
  orientation) and solves the IK again. Every in-between is a constructed pose, even across postures
  (e.g. lying → sitting).

### Crowd, drawing and studio

- **Crowd.** Density-field placement, 7 motifs expressed as postures plus limb intentions, damped root
  fitting, continuous pose accommodation and honest shortfall reporting.
- **Validation.** An independent pass over every person: proxy penetration, ground, joint limits and
  water.
- **Drawing.** Smooth contours are zero crossings of the interpolated n·v across faces, so they follow
  the surface rather than its facets. Feature curves are extracted the same way. Both go through
  exact orthographic hidden-line removal, with suppression of the face each contour runs across. Mesh
  resolution follows paper scale (about 0.45 mm of paper per cell). Then chaining, cropping, 0.05 mm
  simplification, a 0.3 mm fragment filter and travel ordering.
- **Output.** SVG in mm with layers, a production report with staged population accounting, and a
  versioned scene snapshot (schema 2: body bank, pose params and final joints).
- **Studio.**
  - The **Crowd** mode composes a beach.
  - The **Pose lab** shows a gallery of generated poses or an in-between strip, with varied bodies or
    one body you set with sliders.
  - Both use the shaded preview (with picking, an inspector and diagnostic colours) and the exact SVG
    preview.

### Measured (MacBook, Node 25, A2, default settings, headless)

| People | Scene | Lines | Triangles | Strokes | Ink | Est. plot | Peak RSS |
|---|---|---|---|---|---|---|---|
| 300 | 2.5 s | 7.5 s* | 5.9 M | 13 k | 60 m | 1.4 h | — |
| 1000 | 4.6 s | 6.1 s | 6.4 M | 37 k | 111 m | 3.2 h | ~1.4 GB |

\* includes polygonising the export-resolution bodies (cached afterwards in the worker). These are
first measurements, not a performance claim.

## Known limits (deliberate POC shortcuts)

- Bodies are procedural implicit surfaces, not MPFB meshes. No faces, fingers, hair volume or
  clothing geometry. An MPFB GLB importer can provide `BodyAsset`s behind the same interface (plan §5).
- Skinning has no corrective shapes, so deep hip and knee bends lose some volume. Surface nets can
  leave a few non-manifold edges where thin parts nearly touch.
- Pose validity uses capsule proxies. Contact and self-collision are approximate, and there is no
  balance check for standing beyond the support rules.
- Collision and validation use conservative capsule proxies only. There is no mesh-level surface,
  self-intersection or containment check yet. There is no Rapier settling (Stage D).
- Fitting is greedy and sequential, with no overlapping-window compression passes or backtracking (Stage C).
- There is no local editing or regeneration yet. The preview has picking and inspection only.
- HLR runs on the whole sheet in one worker. It is not tiled yet (plan §9, tile correctness).
- No density brush. Composition fields come from the seed.

## Suggested next steps (plan §14)

1. Milestone A: plot a 50 × 50 mm dense crop to calibrate pen width, gap and fragment settings;
   optionally import an MPFB body as a `BodyAsset`.
2. Grow the pose vocabulary: more limb modes (reading a book, reaching for a bag), props, and
   interaction modes that target another person's landmarks inside motifs.
3. Add mesh-level pair validation and window-based compression for denser, more intertwined patches.
4. Add local edits: select, rotate about a support, lock, and regenerate a neighbourhood with batch
   invalidation.
5. Tile HLR across two workers. Add vpype-safe optimisation checks.

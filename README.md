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
    assets/             canonical skeleton, body variants, capsule mesh template, posed body mesh
    poses/              pose families + limb variants, forward kinematics, grounding
    motifs/             authored interaction groups (2–4 people)
    constraints/        joint limits, capsule proxy collision world
    synthesis/          composition fields (shore, density, corridor, pockets), placement, root fitting
    validation/         independent per-person acceptance pass + contact relationships
    camera/             orthographic print camera → paper mm projection
    contours/           silhouette + feature-ring candidates, environment lines
    visibility/         projected-triangle grid + analytic hidden-interval solver
    strokes/            chaining, cropping, protected simplification, travel ordering
    export/             SVG writer, plot-time estimate, versioned snapshot I/O
    pipeline/           compileDrawing: snapshot → strokes + report
    index.ts            public API used by the app, worker and scripts
  workers/              pipeline worker + client (progress, cancellation by revision)
  preview/              CrowdPreview: batched Three.js renderer with picking and diagnostic colouring
  app/                  React UI (state reducer, hook, panels) built with shadcn/ui
  components/ui/        shadcn components (generated; edit via `npx shadcn add`)
scripts/render.ts       headless CLI
e2e/                    Playwright tests
```

Plan module → code: assets `core/assets`, poses `core/poses`, synthesis `core/synthesis`, constraints
`core/constraints`, validation `core/validation`, preview `src/preview`, contours `core/contours`, visibility
`core/visibility`, strokes `core/strokes`, export `core/export`.

## What the POC does today

- **Bodies.** A procedural stand-in for MPFB: 17 bones with semantic names, 7 body variants (including a
  child), each segment an elliptical capsule. All segments share one closed mesh template, so edge/face
  adjacency is computed once.
- **Poses.** 6 pose families across the 5 postures, each with 2–5 alternate limb placements, bounded joint
  jitter and conservative joint limits. FK grounds every pose exactly on the sand.
- **Crowd.** Density-field placement (dense centre, a compressed patch, a route to the water, empty
  pockets, shoreline), 7 authored motifs, damped root fitting against a spatial hash of capsule proxies, and
  **pose accommodation**: a person switches limb variant when that variant fits. Shortfalls are reported, never
  forced.
- **Validation.** An independent pass over every placed person: proxy penetration, ground, joint limits,
  water. It also records touch and near relationships.
- **Drawing.** Silhouettes from the front/back face boundary on the posed surface, authored feature rings
  (waistband, shorts hem, top band, hairline), towels, shoreline and wave marks. All of them go through
  exact orthographic hidden-line removal with incident-face suppression, so self-occlusion is kept. Then
  degree-2 chaining (never across people), cropping, 0.05 mm RDP, a 0.3 mm fragment filter and
  nearest-neighbour ordering.
- **Output.** SVG in mm with Inkscape layers, no fills or masks. A production report with staged population
  accounting (requested → placed → valid → in frame → contributing → recognisable), ink and travel length,
  and a plot-time estimate. The scene snapshot JSON reopens without regenerating.
- **Studio.** Controls, a shaded preview locked to the print camera with orbit, person picking and an
  inspector, colour modes (person, posture, validation, hidden people), the exact SVG preview at fit or
  nominal actual size, and cancellable worker jobs.

### Measured (MacBook, Node 25, A2, default settings, headless)

| People | Scene | Lines | Triangles | Strokes | Ink | Est. plot | Peak RSS |
|---|---|---|---|---|---|---|---|
| 1000 | 0.7 s | 2.4 s | 4.3 M | 36 k | 114 m | 3.2 h | ~0.9 GB |
| 3000 | 2.5 s | 7.9 s | 12.9 M | 104 k | 196 m | 7.8 h | ~1.6 GB |

These are first measurements, not a performance claim. The browser has not been profiled yet.

## Known limits (deliberate POC shortcuts)

- The bodies are capsule mannequins, not MPFB meshes. The next step is the asset manifest and GLB import
  behind `core/assets` (plan §5), keeping the same `Capsule`/`BodyMesh` contracts.
- Faceted silhouettes show slight zig-zags. Smooth-surface contours are future work (plan §9).
- Collision and validation use conservative capsule proxies only. There is no mesh-level surface,
  self-intersection or containment check yet. There is no Rapier settling (Stage D).
- Fitting is greedy and sequential, with no overlapping-window compression passes or backtracking (Stage C).
- There is no local editing or regeneration yet. The preview has picking and inspection only.
- HLR runs on the whole sheet in one worker. It is not tiled yet (plan §9, tile correctness).
- No density brush. Composition fields come from the seed.

## Suggested next steps (plan §14)

1. Milestone A: import one MPFB body with five poses through the same mesh and contour path, and plot a
   50 × 50 mm dense crop to calibrate pen width, gap and fragment settings.
2. Add mesh-level pair validation and window-based compression for denser, more intertwined patches.
3. Add local edits: select, rotate about a support, lock, and regenerate a neighbourhood with batch
   invalidation.
4. Tile HLR across two workers. Add vpype-safe optimisation checks.

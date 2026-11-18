import { buildBodyMesh } from '../assets/bodyMesh'
import { EXPORT_RESOLUTION, getCapsuleTemplate, type MeshResolution } from '../assets/capsuleTemplate'
import type { BodyRegion } from '../assets/skeleton'
import { createProjector } from '../camera/projection'
import { environmentSegments } from '../contours/environment'
import { extractBodyLines } from '../contours/extract'
import type { CandidateSegment, LineClass } from '../contours/types'
import { polylineLength } from '../math/geometry'
import { PAPER_BY_ID, type PaperProfile } from '../scene/paper'
import type { SceneSnapshot } from '../scene/types'
import { chainPieces } from '../strokes/chain'
import { clipStrokes } from '../strokes/clip'
import { orderStrokes } from '../strokes/order'
import { cleanupStrokes } from '../strokes/postprocess'
import type { Stroke, VisiblePiece } from '../strokes/types'
import { personCapsules } from '../synthesis/personGeometry'
import { DEFAULT_HLR, visibleIntervals, type HlrOptions } from '../visibility/hlr'
import { OccluderSet, TriangleGrid } from '../visibility/occluders'
import { estimatePlot, type PlotEstimate, type PlotterProfile, DEFAULT_PLOTTER } from '../export/plotEstimate'

export interface DrawingOptions {
  /** Override the scene's paper profile (e.g. A3 proof of an A2 scene). */
  paperId?: string
  resolution: MeshResolution
  /** Include authored feature curves (swimwear, hairline). */
  details: boolean
  simplifyToleranceMm: number
  minFragmentMm: number
  hlr: HlrOptions
  plotter: PlotterProfile
  /** Visible ink a person needs to count as contributing, mm. */
  contributingMm: number
  /** Visible head ink a person needs to count as recognisable, mm. */
  recognisableHeadMm: number
  /** Visible body ink (non-head) a person needs to count as recognisable, mm. */
  recognisableBodyMm: number
}

export const DEFAULT_DRAWING_OPTIONS: DrawingOptions = {
  resolution: EXPORT_RESOLUTION,
  details: true,
  simplifyToleranceMm: 0.05,
  minFragmentMm: 0.3,
  hlr: DEFAULT_HLR,
  plotter: DEFAULT_PLOTTER,
  contributingMm: 2,
  recognisableHeadMm: 1,
  recognisableBodyMm: 4,
}

export interface PopulationAccounting {
  requested: number
  placed: number
  valid: number
  inFrame: number
  contributing: number
  recognisable: number
}

export interface DrawingReport {
  paper: PaperProfile
  mmPerMetre: number
  population: PopulationAccounting
  thresholds: { contributingMm: number; recognisableHeadMm: number; recognisableBodyMm: number }
  geometry: { triangles: number; occluders: number; candidateSegments: number; visiblePieces: number }
  lines: PlotEstimate & { lengthByClassMm: Record<LineClass, number> }
  timingMs: { meshes: number; index: number; visibility: number; strokes: number; total: number }
}

export interface DrawingResult {
  strokes: Stroke[]
  /** Visible ink per person id, mm (attribution overlay). */
  visibleMmByPerson: number[]
  report: DrawingReport
}

export type DrawingProgress = (fraction: number, label: string) => void

/**
 * Drawing compiler (plan §9–10): frozen scene → attributed, visible pen
 * strokes in paper millimetres. Pure and deterministic.
 */
export function compileDrawing(
  scene: SceneSnapshot,
  options: Partial<DrawingOptions> = {},
  onProgress?: DrawingProgress,
): DrawingResult {
  const opts = { ...DEFAULT_DRAWING_OPTIONS, ...options }
  const t0 = performance.now()
  const paper = (opts.paperId && PAPER_BY_ID[opts.paperId]) || scene.paper
  const projector = createProjector(scene.camera, paper)
  const rect = projector.drawRect
  const template = getCapsuleTemplate(opts.resolution)
  const invalid = new Set(scene.validation.invalidPeople)

  // 1. Bake posed meshes, project, collect occluders and candidates.
  const occluders = new OccluderSet(1 << 16)
  const candidates: CandidateSegment[] = []
  const inFrame = new Uint8Array(scene.people.length)
  let vertexBase = 0
  let triangles = 0
  const margin = 5
  scene.people.forEach((person, i) => {
    const mesh = buildBodyMesh(personCapsules(person), opts.resolution)
    triangles += template.faceCount * mesh.capsuleCount
    const before = candidates.length
    const occBefore = occluders.count
    const { bounds } = extractBodyLines(mesh, person.id, vertexBase, person.outfit, opts.details, projector, occluders, candidates)
    vertexBase += template.vertexCount * mesh.capsuleCount
    const overlaps = bounds.x1 >= rect.x0 && bounds.x0 <= rect.x1 && bounds.y1 >= rect.y0 && bounds.y0 <= rect.y1
    inFrame[i] = overlaps ? 1 : 0
    const nearFrame =
      bounds.x1 >= rect.x0 - margin && bounds.x0 <= rect.x1 + margin && bounds.y1 >= rect.y0 - margin && bounds.y0 <= rect.y1 + margin
    if (!nearFrame) {
      candidates.length = before
      occluders.count = occBefore
    }
    if (i % 50 === 0) onProgress?.(0.25 * (i / scene.people.length), 'Baking posed surfaces')
  })
  candidates.push(...environmentSegments(scene, projector, vertexBase))
  const tMesh = performance.now()

  // 2. Index occluders in paper space.
  let meanSize = 0
  for (let k = 0; k < occluders.count; k++) {
    const o = k * 9
    const t = occluders.tri
    meanSize += Math.max(Math.abs(t[o] - t[o + 3]), Math.abs(t[o + 3] - t[o + 6]), Math.abs(t[o + 1] - t[o + 4]))
  }
  meanSize /= Math.max(1, occluders.count)
  const cellSize = Math.min(20, Math.max(0.5, meanSize * 3))
  const grid = new TriangleGrid(
    occluders,
    { x0: rect.x0 - margin, y0: rect.y0 - margin, x1: rect.x1 + margin, y1: rect.y1 + margin },
    cellSize,
  )
  const tIndex = performance.now()
  onProgress?.(0.3, 'Hidden-line removal')

  // 3. Hidden-line removal.
  const pieces: VisiblePiece[] = []
  let uniqueKey = -1
  const total = candidates.length
  for (let s = 0; s < total; s++) {
    const seg = candidates[s]
    const intervals = visibleIntervals(seg, occluders, grid, opts.hlr)
    for (let k = 0; k < intervals.length; k += 2) {
      const a = intervals[k]
      const b = intervals[k + 1]
      pieces.push({
        owner: seg.owner,
        cls: seg.cls,
        region: seg.region,
        k0: a <= 0 ? seg.ia : uniqueKey--,
        k1: b >= 1 ? seg.ib : uniqueKey--,
        x0: seg.u0 + (seg.u1 - seg.u0) * a,
        y0: seg.v0 + (seg.v1 - seg.v0) * a,
        x1: seg.u0 + (seg.u1 - seg.u0) * b,
        y1: seg.v0 + (seg.v1 - seg.v0) * b,
      })
    }
    if (s % 20000 === 0) onProgress?.(0.3 + 0.6 * (s / total), `Hidden-line removal ${Math.round((100 * s) / total)}%`)
  }
  const tVis = performance.now()
  onProgress?.(0.92, 'Joining and simplifying strokes')

  // 4. Stroke graph: chain, crop, simplify, filter, order.
  const chained = chainPieces(pieces)
  const cropped = clipStrokes(chained, rect)
  const cleaned = cleanupStrokes(cropped, opts)
  const strokes = orderStrokes(cleaned)
  const tStrokes = performance.now()

  // 5. Population accounting from actual visible ink.
  const visibleMmByPerson = new Array<number>(scene.people.length).fill(0)
  const headMm = new Array<number>(scene.people.length).fill(0)
  const lengthByClassMm: Record<LineClass, number> = { contour: 0, feature: 0, environment: 0 }
  for (const s of strokes) {
    const len = polylineLength(s.points)
    lengthByClassMm[s.cls] += len
    if (s.owner >= 0) {
      visibleMmByPerson[s.owner] += len
      if ((s.region as BodyRegion) === 'head') headMm[s.owner] += len
    }
  }
  let contributing = 0
  let recognisable = 0
  scene.people.forEach((p, i) => {
    if (invalid.has(p.id)) return
    if (visibleMmByPerson[i] >= opts.contributingMm) contributing++
    if (headMm[i] >= opts.recognisableHeadMm && visibleMmByPerson[i] - headMm[i] >= opts.recognisableBodyMm) recognisable++
  })
  onProgress?.(1, 'Done')

  return {
    strokes,
    visibleMmByPerson,
    report: {
      paper,
      mmPerMetre: projector.mmPerMetre,
      population: {
        requested: scene.stats.requested,
        placed: scene.people.length,
        valid: scene.people.length - invalid.size,
        inFrame: inFrame.reduce((s, v) => s + v, 0),
        contributing,
        recognisable,
      },
      thresholds: {
        contributingMm: opts.contributingMm,
        recognisableHeadMm: opts.recognisableHeadMm,
        recognisableBodyMm: opts.recognisableBodyMm,
      },
      geometry: { triangles, occluders: occluders.count, candidateSegments: candidates.length, visiblePieces: pieces.length },
      lines: { ...estimatePlot(strokes, opts.plotter), lengthByClassMm },
      timingMs: {
        meshes: tMesh - t0,
        index: tIndex - tMesh,
        visibility: tVis - tIndex,
        strokes: tStrokes - tVis,
        total: performance.now() - t0,
      },
    },
  }
}

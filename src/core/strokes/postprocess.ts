import { polylineLength, simplifyPolyline } from '../math/geometry'
import type { Stroke } from './types'

export interface StrokeCleanupOptions {
  /** Maximum simplification error, paper mm. */
  simplifyToleranceMm: number
  /** Optional fragments shorter than this are dropped, paper mm. */
  minFragmentMm: number
}

/**
 * Protected simplification: RDP within a paper-space bound. Endpoints are
 * always preserved, so occlusion breaks and junctions do not move.
 */
export function cleanupStrokes(strokes: Stroke[], opts: StrokeCleanupOptions): Stroke[] {
  const out: Stroke[] = []
  for (const s of strokes) {
    const points = simplifyPolyline(s.points, opts.simplifyToleranceMm)
    if (polylineLength(points) < opts.minFragmentMm) continue
    out.push({ ...s, points })
  }
  return out
}

import { polylineLength } from '../math/geometry'
import type { Stroke } from '../strokes/types'

/** Machine assumptions for the duration estimate; calibrate on the real plotter. */
export interface PlotterProfile {
  drawSpeedMmS: number
  travelSpeedMmS: number
  liftCycleS: number
}

export const DEFAULT_PLOTTER: PlotterProfile = { drawSpeedMmS: 30, travelSpeedMmS: 80, liftCycleS: 0.2 }

export interface PlotEstimate {
  strokeCount: number
  drawLengthMm: number
  travelLengthMm: number
  penLifts: number
  estimatedDurationS: number
}

/** Plan §10: draw / speed + travel / speed + lifts * cycle (acceleration not modelled). */
export function estimatePlot(strokes: Stroke[], plotter: PlotterProfile): PlotEstimate {
  let draw = 0
  let travel = 0
  let px = 0
  let py = 0
  for (const s of strokes) {
    const p = s.points
    travel += Math.hypot(p[0] - px, p[1] - py)
    draw += polylineLength(p)
    px = p[p.length - 2]
    py = p[p.length - 1]
  }
  return {
    strokeCount: strokes.length,
    drawLengthMm: draw,
    travelLengthMm: travel,
    penLifts: strokes.length,
    estimatedDurationS: draw / plotter.drawSpeedMmS + travel / plotter.travelSpeedMmS + strokes.length * plotter.liftCycleS,
  }
}

import type { Rect } from '../scene/paper'
import type { Stroke } from './types'

/** Liang–Barsky clip of one segment; returns [t0, t1] or null. */
export function clipSegment(x0: number, y0: number, x1: number, y1: number, r: Rect): [number, number] | null {
  let t0 = 0
  let t1 = 1
  const dx = x1 - x0
  const dy = y1 - y0
  const p = [-dx, dx, -dy, dy]
  const q = [x0 - r.x0, r.x1 - x0, y0 - r.y0, r.y1 - y0]
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null
    } else {
      const t = q[i] / p[i]
      if (p[i] < 0) {
        if (t > t1) return null
        if (t > t0) t0 = t
      } else {
        if (t < t0) return null
        if (t < t1) t1 = t
      }
    }
  }
  return [t0, t1]
}

/** Crop strokes to the print region explicitly; no masks (plan §10). */
export function clipStrokes(strokes: Stroke[], rect: Rect): Stroke[] {
  const out: Stroke[] = []
  for (const s of strokes) {
    const pts = s.points
    let current: number[] = []
    let allInside = true
    const flush = () => {
      if (current.length >= 4) out.push({ ...s, points: current, closed: false })
      current = []
    }
    for (let i = 2; i < pts.length; i += 2) {
      const x0 = pts[i - 2], y0 = pts[i - 1], x1 = pts[i], y1 = pts[i + 1]
      const c = clipSegment(x0, y0, x1, y1, rect)
      if (!c) {
        allInside = false
        flush()
        continue
      }
      const [t0, t1] = c
      if (t0 > 0 || t1 < 1) allInside = false
      const ax = x0 + (x1 - x0) * t0, ay = y0 + (y1 - y0) * t0
      const bx = x0 + (x1 - x0) * t1, by = y0 + (y1 - y0) * t1
      if (current.length === 0 || t0 > 0) {
        flush()
        current.push(ax, ay)
      }
      current.push(bx, by)
      if (t1 < 1) flush()
    }
    if (allInside) out.push(s)
    else flush()
  }
  return out
}

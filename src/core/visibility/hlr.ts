import type { OccluderSet, TriangleGrid } from './occluders'

/**
 * Candidate line segment in paper space. Depth is in scene metres along the
 * view direction; under orthographic projection it varies linearly with t.
 */
export interface SegmentInput {
  u0: number
  v0: number
  d0: number
  u1: number
  v1: number
  d1: number
  /** Global vertex ids of the endpoints (-1 when not on a mesh). */
  ia: number
  ib: number
}

export interface HlrOptions {
  /** Camera-depth tolerance, metres. A triangle must be this much closer to hide a line. */
  depthEpsilon: number
  /** Visible or hidden pieces shorter than this (paper mm) are merged away. */
  paperEpsilon: number
}

export const DEFAULT_HLR: HlrOptions = { depthEpsilon: 2e-4, paperEpsilon: 0.01 }

/** Restrict [lo, hi] to where a + b * t >= 0. Returns false if empty. */
function clipLinear(range: [number, number], a: number, b: number): boolean {
  if (Math.abs(b) < 1e-15) return a >= 0
  const t = -a / b
  if (b > 0) {
    if (t > range[0]) range[0] = t
  } else if (t < range[1]) range[1] = t
  return range[0] < range[1]
}

const range: [number, number] = [0, 1]

/** Signed edge function of point (x, y) against the directed edge p→q. */
function e(px: number, py: number, qx: number, qy: number, x: number, y: number): number {
  return (qx - px) * (y - py) - (qy - py) * (x - px)
}

/**
 * Authoritative visibility (plan §9): clip the segment against every
 * overlapping projected triangle, find where the triangle is closer, union
 * those hidden intervals, and return the visible complement as [t0, t1, ...].
 * Faces sharing a vertex with the segment are ignored (incident-face
 * suppression); the rest of the owner's body still occludes it.
 */
export function visibleIntervals(seg: SegmentInput, occ: OccluderSet, grid: TriangleGrid, opts: HlrOptions = DEFAULT_HLR): number[] {
  const { u0, v0, d0, u1, v1, d1, ia, ib } = seg
  const du = u1 - u0
  const dv = v1 - v0
  const len = Math.hypot(du, dv)
  if (len < 1e-9) return []
  const maxSegDepth = Math.max(d0, d1)
  const hidden: number[] = []
  const t = occ.tri
  const verts = occ.verts
  const eps = opts.depthEpsilon
  let fullyHidden = false

  grid.query(Math.min(u0, u1), Math.min(v0, v1), Math.max(u0, u1), Math.max(v0, v1), (k) => {
    if (occ.minDepth[k] >= maxSegDepth - eps) return
    const vk = k * 3
    const a = verts[vk], b = verts[vk + 1], c = verts[vk + 2]
    if (ia >= 0 && (a === ia || b === ia || c === ia)) return
    if (ib >= 0 && (a === ib || b === ib || c === ib)) return
    const o = k * 9
    const ax = t[o], ay = t[o + 1], ad = t[o + 2]
    const bx = t[o + 3], by = t[o + 4], bd = t[o + 5]
    const cx = t[o + 6], cy = t[o + 7], cd = t[o + 8]
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    if (Math.abs(area) < 1e-10) return
    const sgn = area > 0 ? 1 : -1
    range[0] = 0
    range[1] = 1
    // Edge functions along the segment: E(t) = E0 + t * (E1 - E0).
    const eAB0 = e(ax, ay, bx, by, u0, v0), eAB1 = e(ax, ay, bx, by, u1, v1)
    if (!clipLinear(range, sgn * eAB0, sgn * (eAB1 - eAB0))) return
    const eBC0 = e(bx, by, cx, cy, u0, v0), eBC1 = e(bx, by, cx, cy, u1, v1)
    if (!clipLinear(range, sgn * eBC0, sgn * (eBC1 - eBC0))) return
    const eCA0 = e(cx, cy, ax, ay, u0, v0), eCA1 = e(cx, cy, ax, ay, u1, v1)
    if (!clipLinear(range, sgn * eCA0, sgn * (eCA1 - eCA0))) return
    // Triangle depth along the segment via barycentrics (linear in t).
    const inv = 1 / area
    const tri0 = (eBC0 * ad + eCA0 * bd + eAB0 * cd) * inv
    const tri1 = (eBC1 * ad + eCA1 * bd + eAB1 * cd) * inv
    // Hidden where segDepth - triDepth - eps > 0.
    const g0 = d0 - tri0 - eps
    const g1 = d1 - tri1 - eps
    if (!clipLinear(range, g0, g1 - g0)) return
    hidden.push(range[0], range[1])
    if (range[0] <= 0 && range[1] >= 1) {
      fullyHidden = true
      return false
    }
  })

  if (fullyHidden) return []
  if (hidden.length === 0) return [0, 1]
  // Union of hidden intervals.
  const n = hidden.length / 2
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => hidden[x * 2] - hidden[y * 2])
  const gap = opts.paperEpsilon / len
  const visible: number[] = []
  let cursor = 0
  for (const i of order) {
    const h0 = hidden[i * 2]
    const h1 = hidden[i * 2 + 1]
    if (h0 - cursor > gap) visible.push(cursor, h0)
    if (h1 > cursor) cursor = h1
  }
  if (1 - cursor > gap) visible.push(cursor, 1)
  return visible
}

export interface Vec2 {
  x: number
  y: number
}


export const DEG = Math.PI / 180

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Closest points between segments p1-q1 and p2-q2 (Ericson, Real-Time
 * Collision Detection, 5.1.9). Returns squared distance and parameters.
 */
export function segmentSegmentDistSq(
  p1x: number, p1y: number, p1z: number,
  q1x: number, q1y: number, q1z: number,
  p2x: number, p2y: number, p2z: number,
  q2x: number, q2y: number, q2z: number,
  out?: { s: number; t: number; cx: number; cy: number; cz: number; dx: number; dy: number; dz: number },
): number {
  const d1x = q1x - p1x, d1y = q1y - p1y, d1z = q1z - p1z
  const d2x = q2x - p2x, d2y = q2y - p2y, d2z = q2z - p2z
  const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z
  const a = d1x * d1x + d1y * d1y + d1z * d1z
  const e = d2x * d2x + d2y * d2y + d2z * d2z
  const f = d2x * rx + d2y * ry + d2z * rz
  const EPS = 1e-12
  let s: number
  let t: number
  if (a <= EPS && e <= EPS) {
    s = 0
    t = 0
  } else if (a <= EPS) {
    s = 0
    t = clamp(f / e, 0, 1)
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz
    if (e <= EPS) {
      t = 0
      s = clamp(-c / a, 0, 1)
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z
      const denom = a * e - b * b
      s = denom !== 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0
      t = (b * s + f) / e
      if (t < 0) {
        t = 0
        s = clamp(-c / a, 0, 1)
      } else if (t > 1) {
        t = 1
        s = clamp((b - c) / a, 0, 1)
      }
    }
  }
  const c1x = p1x + d1x * s, c1y = p1y + d1y * s, c1z = p1z + d1z * s
  const c2x = p2x + d2x * t, c2y = p2y + d2y * t, c2z = p2z + d2z * t
  const dx = c1x - c2x, dy = c1y - c2y, dz = c1z - c2z
  if (out) {
    out.s = s
    out.t = t
    out.cx = c1x
    out.cy = c1y
    out.cz = c1z
    out.dx = dx
    out.dy = dy
    out.dz = dz
  }
  return dx * dx + dy * dy + dz * dz
}

/** Ramer–Douglas–Peucker on a flat [x0,y0,x1,y1,...] array. Endpoints are kept. */
export function simplifyPolyline(points: number[], tolerance: number): number[] {
  const n = points.length / 2
  if (n <= 2 || tolerance <= 0) return points.slice()
  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1
  const stack: [number, number][] = [[0, n - 1]]
  const tol2 = tolerance * tolerance
  while (stack.length) {
    const [i0, i1] = stack.pop()!
    const ax = points[i0 * 2], ay = points[i0 * 2 + 1]
    const bx = points[i1 * 2], by = points[i1 * 2 + 1]
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    let maxD = -1
    let maxI = -1
    for (let i = i0 + 1; i < i1; i++) {
      const px = points[i * 2] - ax, py = points[i * 2 + 1] - ay
      let d2: number
      if (len2 === 0) d2 = px * px + py * py
      else {
        const t = clamp((px * dx + py * dy) / len2, 0, 1)
        const ex = px - t * dx, ey = py - t * dy
        d2 = ex * ex + ey * ey
      }
      if (d2 > maxD) {
        maxD = d2
        maxI = i
      }
    }
    if (maxI >= 0 && maxD > tol2) {
      keep[maxI] = 1
      stack.push([i0, maxI], [maxI, i1])
    }
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i * 2], points[i * 2 + 1])
  return out
}

export function polylineLength(points: ArrayLike<number>): number {
  let len = 0
  for (let i = 2; i < points.length; i += 2) {
    len += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1])
  }
  return len
}

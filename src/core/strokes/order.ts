import type { Stroke } from './types'

/**
 * Greedy nearest-neighbour ordering with optional reversal, using a grid of
 * stroke endpoints. Reduces pen-up travel; it never changes stroke geometry.
 */
export function orderStrokes(strokes: Stroke[], cellSize = 10): Stroke[] {
  const n = strokes.length
  if (n <= 1) return strokes.slice()
  const grid = new Map<number, number[]>()
  const key = (x: number, y: number) => Math.floor(x / cellSize) * 100003 + Math.floor(y / cellSize)
  const endpoint = (i: number, end: number): [number, number] => {
    const p = strokes[i].points
    return end === 0 ? [p[0], p[1]] : [p[p.length - 2], p[p.length - 1]]
  }
  for (let i = 0; i < n; i++) {
    for (const end of [0, 1]) {
      const [x, y] = endpoint(i, end)
      const k = key(x, y)
      let list = grid.get(k)
      if (!list) grid.set(k, (list = []))
      list.push(i * 2 + end)
    }
  }
  let maxCoord = 0
  for (const s of strokes) for (const v of s.points) maxCoord = Math.max(maxCoord, Math.abs(v))
  const maxRing = Math.ceil((2 * maxCoord) / cellSize) + 2
  const used = new Uint8Array(n)
  const out: Stroke[] = []
  let px = 0
  let py = 0
  let remaining = n
  while (remaining > 0) {
    let best = -1
    let bestD = Infinity
    const cx = Math.floor(px / cellSize)
    const cy = Math.floor(py / cellSize)
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let gx = cx - ring; gx <= cx + ring; gx++) {
        for (let gy = cy - ring; gy <= cy + ring; gy++) {
          if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== ring) continue
          const list = grid.get(gx * 100003 + gy)
          if (!list) continue
          for (const ref of list) {
            const i = ref >> 1
            if (used[i]) continue
            const [x, y] = endpoint(i, ref & 1)
            const d = (x - px) ** 2 + (y - py) ** 2
            if (d < bestD) {
              bestD = d
              best = ref
            }
          }
        }
      }
      // Anything in a farther ring is at least ring * cellSize away.
      if (best >= 0 && Math.sqrt(bestD) <= ring * cellSize) break
    }
    if (best < 0) best = used.findIndex((u) => !u) * 2
    const i = best >> 1
    used[i] = 1
    remaining--
    const s = strokes[i]
    let pts = s.points
    if ((best & 1) === 1) {
      const rev: number[] = []
      for (let j = pts.length - 2; j >= 0; j -= 2) rev.push(pts[j], pts[j + 1])
      pts = rev
    }
    out.push(pts === s.points ? s : { ...s, points: pts })
    px = pts[pts.length - 2]
    py = pts[pts.length - 1]
  }
  return out
}

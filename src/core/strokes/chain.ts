import type { Stroke, VisiblePiece } from './types'

/**
 * Join visible pieces into polylines through shared mesh vertices.
 * Joins only happen at keys of degree exactly two with identical owner and
 * class, so one person's arm is never attached to another body, and
 * visibility breaks and T-junctions stay as protected endpoints (plan §10).
 */
export function chainPieces(pieces: VisiblePiece[]): Stroke[] {
  const ends = new Map<number, number[]>()
  const addEnd = (key: number, ref: number) => {
    let list = ends.get(key)
    if (!list) ends.set(key, (list = []))
    list.push(ref)
  }
  pieces.forEach((p, i) => {
    addEnd(p.k0, i * 2)
    addEnd(p.k1, i * 2 + 1)
  })
  const used = new Uint8Array(pieces.length)
  const strokes: Stroke[] = []

  const nextFrom = (pieceIndex: number, key: number): { piece: number; end: number } | null => {
    const list = ends.get(key)
    if (!list || list.length !== 2) return null
    const ref = list[0] >> 1 === pieceIndex ? list[1] : list[0]
    const piece = ref >> 1
    if (piece === pieceIndex || used[piece]) return null
    const a = pieces[pieceIndex]
    const b = pieces[piece]
    if (a.owner !== b.owner || a.cls !== b.cls) return null
    return { piece, end: ref & 1 }
  }

  for (let i = 0; i < pieces.length; i++) {
    if (used[i]) continue
    used[i] = 1
    const p = pieces[i]
    const forward: number[] = [p.x0, p.y0, p.x1, p.y1]
    let closed = false
    // Extend forward from end 1.
    let cur = i
    let key = p.k1
    for (;;) {
      const n = nextFrom(cur, key)
      if (!n) break
      used[n.piece] = 1
      const q = pieces[n.piece]
      if (n.end === 0) {
        forward.push(q.x1, q.y1)
        key = q.k1
      } else {
        forward.push(q.x0, q.y0)
        key = q.k0
      }
      cur = n.piece
    }
    if (key === p.k0 && key >= 0 && forward.length > 4) {
      const list = ends.get(key)
      if (list && list.length === 2) closed = true
    }
    // Extend backward from end 0.
    const backward: number[] = []
    if (!closed) {
      cur = i
      key = p.k0
      for (;;) {
        const n = nextFrom(cur, key)
        if (!n) break
        used[n.piece] = 1
        const q = pieces[n.piece]
        if (n.end === 0) {
          backward.push(q.x1, q.y1)
          key = q.k1
        } else {
          backward.push(q.x0, q.y0)
          key = q.k0
        }
        cur = n.piece
      }
    }
    const points: number[] = []
    for (let j = backward.length - 2; j >= 0; j -= 2) points.push(backward[j], backward[j + 1])
    points.push(...forward)
    strokes.push({ owner: p.owner, cls: p.cls, region: p.region, points, closed })
  }
  return strokes
}

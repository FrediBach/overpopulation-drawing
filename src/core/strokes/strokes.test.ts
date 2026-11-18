import { chainPieces } from './chain'
import { clipStrokes } from './clip'
import { orderStrokes } from './order'
import { cleanupStrokes } from './postprocess'
import type { Stroke, VisiblePiece } from './types'

const piece = (k0: number, k1: number, x0: number, y0: number, x1: number, y1: number, owner = 0): VisiblePiece => ({
  owner,
  cls: 'contour',
  region: 'torso',
  k0,
  k1,
  x0,
  y0,
  x1,
  y1,
})

describe('chainPieces', () => {
  it('joins a loop of segments into one closed stroke', () => {
    const strokes = chainPieces([piece(1, 2, 0, 0, 1, 0), piece(2, 3, 1, 0, 1, 1), piece(3, 4, 1, 1, 0, 1), piece(4, 1, 0, 1, 0, 0)])
    expect(strokes).toHaveLength(1)
    expect(strokes[0].closed).toBe(true)
  })

  it('joins pieces regardless of their direction', () => {
    const strokes = chainPieces([piece(1, 2, 0, 0, 1, 0), piece(3, 2, 2, 0, 1, 0)])
    expect(strokes).toHaveLength(1)
    expect(strokes[0].points).toEqual([0, 0, 1, 0, 2, 0])
  })

  it('never joins across owners', () => {
    expect(chainPieces([piece(1, 2, 0, 0, 1, 0, 0), piece(2, 3, 1, 0, 2, 0, 1)])).toHaveLength(2)
  })

  it('keeps visibility breaks (unique negative keys) as endpoints', () => {
    expect(chainPieces([piece(1, -1, 0, 0, 1, 0), piece(-2, 3, 1.2, 0, 2, 0)])).toHaveLength(2)
  })

  it('does not merge through a T-junction (degree 3)', () => {
    const strokes = chainPieces([piece(1, 2, 0, 0, 1, 0), piece(2, 3, 1, 0, 2, 0), piece(2, 4, 1, 0, 1, 1)])
    expect(strokes).toHaveLength(3)
  })
})

const stroke = (points: number[], owner = 0): Stroke => ({ owner, cls: 'contour', region: 'torso', points, closed: false })

describe('clipStrokes', () => {
  const rect = { x0: 0, y0: 0, x1: 10, y1: 10 }
  it('keeps strokes fully inside', () => {
    expect(clipStrokes([stroke([1, 1, 5, 5])], rect)[0].points).toEqual([1, 1, 5, 5])
  })
  it('crops at the frame', () => {
    expect(clipStrokes([stroke([-5, 5, 5, 5])], rect)[0].points).toEqual([0, 5, 5, 5])
  })
  it('splits a stroke leaving and re-entering', () => {
    expect(clipStrokes([stroke([5, 5, 15, 5, 15, 6, 5, 6])], rect)).toHaveLength(2)
  })
  it('drops strokes fully outside', () => {
    expect(clipStrokes([stroke([20, 20, 30, 30])], rect)).toHaveLength(0)
  })
})

describe('cleanupStrokes', () => {
  it('removes tiny fragments', () => {
    const out = cleanupStrokes([stroke([0, 0, 0.1, 0]), stroke([0, 0, 2, 0])], { simplifyToleranceMm: 0.05, minFragmentMm: 0.3 })
    expect(out).toHaveLength(1)
  })
})

describe('orderStrokes', () => {
  it('keeps every stroke and reduces travel', () => {
    const strokes = [stroke([100, 0, 101, 0]), stroke([0, 0, 1, 0]), stroke([50, 0, 51, 0]), stroke([2, 0, 3, 0])]
    const ordered = orderStrokes(strokes)
    expect(ordered).toHaveLength(4)
    expect(ordered.map((s) => s.points[0])).toEqual([0, 2, 50, 100])
  })

  it('reverses a stroke when its far end is closer', () => {
    const ordered = orderStrokes([stroke([10, 0, 0.5, 0]), stroke([20, 0, 30, 0])])
    expect(ordered[0].points).toEqual([0.5, 0, 10, 0])
  })
})

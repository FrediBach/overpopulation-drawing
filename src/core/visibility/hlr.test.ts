import { visibleIntervals, type SegmentInput } from './hlr'
import { OccluderSet, TriangleGrid } from './occluders'

function setup(tris: number[][], ids: number[][] = []) {
  const occ = new OccluderSet(4)
  tris.forEach((t, i) => {
    const [a, b, c] = ids[i] ?? [-10 - i * 3, -11 - i * 3, -12 - i * 3]
    occ.add(t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8], a, b, c, 1)
  })
  const grid = new TriangleGrid(occ, { x0: -5, y0: -5, x1: 25, y1: 25 }, 2)
  return { occ, grid }
}

const seg = (d: number, s0 = -1, s1 = -1): SegmentInput => ({ u0: 0, v0: 5, d0: d, u1: 10, v1: 5, d1: d, s0, s1, s2: -1 })

describe('visibleIntervals', () => {
  it('hides a segment entirely behind a large triangle', () => {
    const { occ, grid } = setup([[-10, 0, 1, 20, 0, 1, 5, 24, 1]])
    expect(visibleIntervals(seg(2), occ, grid)).toEqual([])
  })

  it('keeps a segment in front of the triangle', () => {
    const { occ, grid } = setup([[-10, 0, 3, 20, 0, 3, 5, 24, 3]])
    expect(visibleIntervals(seg(2), occ, grid)).toEqual([0, 1])
  })

  it('splits a long segment behind a thin occluder crossing its middle (plan fixture 4)', () => {
    const { occ, grid } = setup([[4.9, 0, 1, 5.1, 0, 1, 5, 10, 1]])
    const v = visibleIntervals(seg(2), occ, grid)
    expect(v).toHaveLength(4)
    expect(v[0]).toBe(0)
    expect(v[1]).toBeGreaterThan(0.48)
    expect(v[1]).toBeLessThan(0.5)
    expect(v[2]).toBeGreaterThan(0.5)
    expect(v[2]).toBeLessThan(0.52)
    expect(v[3]).toBe(1)
  })

  it('finds the crossing point of a slanted occluder', () => {
    // Plane depth = 3 - (x + 1) / 6: in front of depth 2 for x > 5.
    const { occ, grid } = setup([[-10, 0, 4.5, 20, 0, -0.5, 5, 24, 2]])
    const v = visibleIntervals(seg(2), occ, grid)
    expect(v).toHaveLength(2)
    expect(v[0]).toBe(0)
    // Offset by the depth epsilon (2e-4 m over a slope of 1/6 per mm).
    expect(v[1]).toBeCloseTo(0.5, 3)
  })

  it('ignores faces sharing a suppressed vertex, but not the rest of the body', () => {
    const { occ, grid } = setup([[-10, 0, 1, 20, 0, 1, 5, 24, 1]], [[7, 8, 9]])
    expect(visibleIntervals(seg(2, 7, 99), occ, grid)).toEqual([0, 1])
    expect(visibleIntervals(seg(2, 50, 99), occ, grid)).toEqual([])
  })

  it('merges hidden intervals across adjacent triangles without slivers', () => {
    // Two triangles forming a quad over the whole segment.
    const { occ, grid } = setup([
      [-1, 0, 1, 11, 0, 1, 11, 10, 1],
      [-1, 0, 1, 11, 10, 1, -1, 10, 1],
    ])
    expect(visibleIntervals(seg(2), occ, grid)).toEqual([])
  })
})

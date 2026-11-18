import { polylineLength, segmentSegmentDistSq, simplifyPolyline } from './geometry'

describe('segmentSegmentDistSq', () => {
  it('measures crossing segments offset in z', () => {
    expect(segmentSegmentDistSq(-1, 0, 0, 1, 0, 0, 0, -1, 2, 0, 1, 2)).toBeCloseTo(4)
  })

  it('clamps to endpoints for disjoint collinear segments', () => {
    expect(segmentSegmentDistSq(0, 0, 0, 1, 0, 0, 3, 0, 0, 4, 0, 0)).toBeCloseTo(4)
  })

  it('handles degenerate (point) segments', () => {
    expect(segmentSegmentDistSq(0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 3, 0)).toBeCloseTo(9)
  })
})

describe('simplifyPolyline', () => {
  it('drops collinear points but keeps endpoints', () => {
    expect(simplifyPolyline([0, 0, 1, 0, 2, 0, 3, 0], 0.01)).toEqual([0, 0, 3, 0])
  })

  it('keeps features larger than the tolerance', () => {
    const out = simplifyPolyline([0, 0, 1, 0.5, 2, 0], 0.05)
    expect(out).toHaveLength(6)
  })

  it('never moves a point more than the tolerance', () => {
    const pts: number[] = []
    for (let i = 0; i <= 100; i++) pts.push(i * 0.1, Math.sin(i * 0.1) * 0.02)
    const out = simplifyPolyline(pts, 0.05)
    expect(out.length).toBeLessThan(pts.length)
    expect(polylineLength(out)).toBeCloseTo(polylineLength(pts), 1)
  })
})

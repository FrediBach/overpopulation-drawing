import { DEFAULT_SETTINGS } from '../scene/types'
import { synthesizeScene } from '../synthesis/synthesize'
import { polylineLength } from '../math/geometry'
import { autoCell, compileDrawing } from './compileDrawing'

describe('compileDrawing', () => {
  const scene = synthesizeScene({ ...DEFAULT_SETTINGS, population: 40, seed: 11 })
  const drawing = compileDrawing(scene)
  const r = drawing.report

  it('produces strokes strictly inside the drawable area', () => {
    expect(drawing.strokes.length).toBeGreaterThan(100)
    const { marginMm, widthMm, heightMm } = r.paper
    for (const s of drawing.strokes) {
      for (let i = 0; i < s.points.length; i += 2) {
        expect(s.points[i]).toBeGreaterThanOrEqual(marginMm - 1e-6)
        expect(s.points[i]).toBeLessThanOrEqual(widthMm - marginMm + 1e-6)
        expect(s.points[i + 1]).toBeGreaterThanOrEqual(marginMm - 1e-6)
        expect(s.points[i + 1]).toBeLessThanOrEqual(heightMm - marginMm + 1e-6)
      }
    }
  })

  it('reports population in non-increasing stages', () => {
    const p = r.population
    expect(p.requested).toBeGreaterThanOrEqual(p.placed)
    expect(p.placed).toBeGreaterThanOrEqual(p.valid)
    expect(p.valid).toBeGreaterThanOrEqual(p.contributing)
    expect(p.inFrame).toBeGreaterThanOrEqual(p.contributing)
    expect(p.contributing).toBeGreaterThanOrEqual(p.recognisable)
    expect(p.contributing).toBeGreaterThan(30)
  })

  it('attributes visible ink to people', () => {
    const sum = drawing.visibleMmByPerson.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(r.lines.drawLengthMm - r.lines.lengthByClassMm.environment, 3)
  })

  it('is deterministic', () => {
    expect(compileDrawing(scene).strokes).toEqual(drawing.strokes)
  })

  it('measures tolerances in paper millimetres: A3 and A2 of one scene (plan fixture 7)', () => {
    const a3 = compileDrawing(scene, { paperId: 'A3' })
    expect(a3.report.mmPerMetre).toBeLessThan(r.mmPerMetre)
    const scale = a3.report.mmPerMetre / r.mmPerMetre
    // Ink scales with paper size; it does not collapse or explode.
    expect(a3.report.lines.drawLengthMm / r.lines.drawLengthMm).toBeGreaterThan(scale * 0.8)
    expect(a3.report.lines.drawLengthMm / r.lines.drawLengthMm).toBeLessThan(scale * 1.15)
    // The fragment filter is applied in mm on both sheets.
    for (const s of a3.strokes) expect(polylineLength(s.points)).toBeGreaterThanOrEqual(0.3 - 1e-9)
  })

  it('picks a coarser body mesh for smaller paper scales', () => {
    expect(autoCell(10)).toBeGreaterThan(autoCell(40))
  })

  it('omits detail lines when requested', () => {
    const plain = compileDrawing(scene, { details: false })
    expect(plain.report.lines.lengthByClassMm.feature).toBe(0)
    expect(r.lines.lengthByClassMm.feature).toBeGreaterThan(0)
  })
})

import { PAPER_BY_ID } from '../scene/paper'
import { DEFAULT_SETTINGS } from '../scene/types'
import { synthesizeScene } from '../synthesis/synthesize'
import { parseScene, serializeScene, SnapshotError, snapshotHash } from './snapshot'
import { strokesToSvg } from './svg'
import { estimatePlot, DEFAULT_PLOTTER } from './plotEstimate'
import type { Stroke } from '../strokes/types'

const strokes: Stroke[] = [
  { owner: 0, cls: 'contour', region: 'torso', points: [10, 10, 20, 20], closed: false },
  { owner: -1, cls: 'environment', region: 'environment', points: [30, 30, 40, 30, 40, 40], closed: true },
]

describe('strokesToSvg', () => {
  const svg = strokesToSvg(strokes, PAPER_BY_ID.A2)

  it('uses physical millimetres with a matching viewBox', () => {
    expect(svg).toContain('width="594mm" height="420mm" viewBox="0 0 594 420"')
  })

  it('only emits unfilled paths, without masks, images or white fills', () => {
    expect(svg).toContain('fill="none"')
    expect(svg).not.toMatch(/<image|<mask|clip-path|fill="white"|fill="#fff/i)
  })

  it('writes one layer per line class', () => {
    expect(svg).toContain('id="body-contours"')
    expect(svg).toContain('id="environment"')
    expect(svg).toContain('<polyline points="10,10 20,20"/>')
    expect(svg).toContain('<polygon points="30,30 40,30 40,40"/>')
  })
})

describe('estimatePlot', () => {
  it('follows draw/speed + travel/speed + lifts * cycle', () => {
    const e = estimatePlot(strokes, DEFAULT_PLOTTER)
    expect(e.penLifts).toBe(2)
    expect(e.drawLengthMm).toBeCloseTo(Math.hypot(10, 10) + 20)
    expect(e.estimatedDurationS).toBeCloseTo(e.drawLengthMm / 30 + e.travelLengthMm / 80 + 0.4)
  })
})

describe('scene snapshot', () => {
  const scene = synthesizeScene({ ...DEFAULT_SETTINGS, population: 15 })

  it('round-trips without loss', () => {
    const json = serializeScene(scene)
    expect(parseScene(json)).toEqual(scene)
    expect(snapshotHash(json)).toMatch(/^[0-9a-f]{8}$/)
  })

  it('rejects other schema versions', () => {
    expect(() => parseScene(JSON.stringify({ ...scene, schemaVersion: 99 }))).toThrow(SnapshotError)
    expect(() => parseScene('nope')).toThrow(SnapshotError)
  })
})

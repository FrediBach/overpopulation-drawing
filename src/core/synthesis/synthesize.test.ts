import { DEFAULT_SETTINGS } from '../scene/types'
import { synthesizeScene } from './synthesize'
import { isInWater } from './composition'

describe('synthesizeScene', () => {
  const settings = { ...DEFAULT_SETTINGS, population: 80, seed: 3 }
  const scene = synthesizeScene(settings)

  it('places the requested population with no validation failures', () => {
    expect(scene.people).toHaveLength(80)
    expect(scene.validation.failures).toEqual([])
    expect(scene.stats.placed).toBe(scene.people.length)
  })

  it('is deterministic for a seed (apart from timestamps)', () => {
    const again = synthesizeScene(settings)
    expect(again.people).toEqual(scene.people)
    expect(again.towels).toEqual(scene.towels)
  })

  it('changes with the seed', () => {
    expect(synthesizeScene({ ...settings, seed: 4 }).people).not.toEqual(scene.people)
  })

  it('keeps people out of the water', () => {
    for (const p of scene.people) expect(isInWater(scene.beach, p.x, p.z)).toBe(false)
  })

  it('stores a pose description and a body for every person', () => {
    for (const p of scene.people) {
      expect(p.pose?.posture).toBe(p.posture)
      expect(scene.bodies[p.bodyIndex]).toBeDefined()
    }
    expect(new Set(scene.people.map((p) => p.bodyIndex)).size).toBeGreaterThan(4)
  })

  it('creates touching relationships and motif groups at high crowding', () => {
    expect(scene.relationships.some((r) => r.kind === 'touch')).toBe(true)
    expect(scene.stats.motifInstances).toBeGreaterThan(0)
  })

  it('respects a posture mix with zero weights', () => {
    const only = synthesizeScene({
      ...settings,
      population: 30,
      postureMix: { lyingBack: 0, lyingFront: 0, lyingSide: 0, sitting: 1, reclining: 0, kneeling: 0, standing: 0 },
    })
    for (const p of only.people) expect(p.posture).toBe('sitting')
  })

  it('reports a shortfall honestly instead of forcing bodies in', () => {
    const tiny = synthesizeScene({ ...settings, population: 150, crowding: 1, postureMix: { lyingBack: 1, lyingFront: 0, lyingSide: 0, sitting: 0, reclining: 0, kneeling: 0, standing: 0 } })
    expect(tiny.validation.failures).toEqual([])
    expect(tiny.stats.placed).toBeLessThanOrEqual(tiny.stats.requested)
    expect(tiny.people).toHaveLength(tiny.stats.placed)
  })
})

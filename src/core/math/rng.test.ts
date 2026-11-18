import { createRng, weightedPick } from './rng'

describe('createRng', () => {
  it('is deterministic per seed and stream', () => {
    const a = createRng(42, 'x')
    const b = createRng(42, 'x')
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()))
  })

  it('separates named streams', () => {
    expect(createRng(42, 'x').next()).not.toEqual(createRng(42, 'y').next())
  })

  it('stays in range', () => {
    const r = createRng(1)
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 7)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThan(7)
    }
  })
})

describe('weightedPick', () => {
  it('never picks zero-weight keys', () => {
    const r = createRng(9)
    for (let i = 0; i < 500; i++) expect(weightedPick(r, { a: 0, b: 1, c: 2 })).not.toBe('a')
  })
})

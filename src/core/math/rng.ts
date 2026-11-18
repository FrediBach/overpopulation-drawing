/**
 * Deterministic random streams. Every subsystem derives its own named stream
 * from the scene seed so that changing one subsystem does not reshuffle another.
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
  range(min: number, max: number): number
  int(minInclusive: number, maxExclusive: number): number
  pick<T>(items: readonly T[]): T
  /** Approximately normal (Irwin–Hall, 4 samples), mean 0, sd ~1. */
  normal(): number
  chance(p: number): boolean
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a string hash, used to derive stream seeds from names. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function createRng(seed: number, stream = 'main'): Rng {
  const next = mulberry32((seed >>> 0) ^ hashString(stream))
  const rng: Rng = {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor((max - min) * next()),
    pick: (items) => items[Math.floor(next() * items.length)],
    normal: () => (next() + next() + next() + next() - 2) * 1.732,
    chance: (p) => next() < p,
  }
  return rng
}

/** Pick a key from a weight table. Keys with weight <= 0 are never chosen. */
export function weightedPick<K extends string>(rng: Rng, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as [K, number][]
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0)
  if (total <= 0) return entries[0][0]
  let r = rng.next() * total
  for (const [k, w] of entries) {
    r -= Math.max(0, w)
    if (r <= 0) return k
  }
  return entries[entries.length - 1][0]
}

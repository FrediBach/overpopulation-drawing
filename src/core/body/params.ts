import { clamp } from '../math/geometry'
import type { Rng } from '../math/rng'

/**
 * Continuous body shape parameters. Every combination is a valid body, so a
 * crowd can contain any number of distinct physiques.
 */
export interface BodyParams {
  /** Overall scale relative to the 1.76 m reference adult. */
  height: number
  /** 0 = lean, 1 = heavy. */
  mass: number
  /** 0 = soft, 1 = athletic. */
  muscle: number
  /** 0 = masculine, 1 = feminine proportions. */
  femininity: number
  /** 0 = adult, 1 = young child (proportions, not just size). */
  child: number
}

export const REFERENCE_BODY: BodyParams = { height: 1, mass: 0.35, muscle: 0.4, femininity: 0.5, child: 0 }

export function sampleBodyParams(rng: Rng, child: boolean): BodyParams {
  if (child) {
    const c = rng.range(0.55, 1)
    return {
      child: c,
      height: rng.range(0.62, 0.8) - 0.08 * (c - 0.55),
      mass: clamp(0.3 + rng.normal() * 0.15, 0, 0.8),
      muscle: rng.range(0.1, 0.4),
      femininity: rng.chance(0.5) ? rng.range(0.55, 0.85) : rng.range(0.15, 0.45),
    }
  }
  const fem = rng.chance(0.5) ? rng.range(0.7, 1) : rng.range(0, 0.3)
  return {
    child: 0,
    height: clamp(1 - 0.045 * (fem - 0.5) * 2 + rng.normal() * 0.035, 0.88, 1.12),
    mass: clamp(0.35 + rng.normal() * 0.22, 0, 1),
    muscle: clamp(0.4 + rng.normal() * 0.2, 0, 1),
    femininity: fem,
  }
}

/** Stable cache key, rounded so tiny float noise does not create new bodies. */
export function bodyKey(p: BodyParams): string {
  const r = (v: number) => Math.round(v * 1000)
  return `${r(p.height)}:${r(p.mass)}:${r(p.muscle)}:${r(p.femininity)}:${r(p.child)}`
}

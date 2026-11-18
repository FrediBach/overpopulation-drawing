import type { Posture } from '@/core'

export type ColorMode = 'person' | 'posture' | 'validity' | 'visibility'

export const POSTURE_COLORS: Record<Posture, [number, number, number]> = {
  lyingBack: [0.86, 0.62, 0.48],
  lyingFront: [0.78, 0.5, 0.42],
  sitting: [0.55, 0.66, 0.82],
  reclining: [0.62, 0.78, 0.6],
  standing: [0.86, 0.78, 0.45],
}

export const NEUTRAL: [number, number, number] = [0.82, 0.8, 0.77]
export const ALERT: [number, number, number] = [0.9, 0.25, 0.2]
export const NOTICE: [number, number, number] = [0.95, 0.65, 0.2]
export const SELECTED: [number, number, number] = [0.15, 0.45, 0.95]

/** Stable pleasant skin-to-tan tones per person id. */
export function personColor(id: number): [number, number, number] {
  const h = Math.sin(id * 12.9898) * 43758.5453
  const t = h - Math.floor(h)
  const base: [number, number, number] = [0.95 - 0.45 * t, 0.78 - 0.4 * t, 0.66 - 0.36 * t]
  return base
}

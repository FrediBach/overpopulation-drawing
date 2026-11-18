import type { BoneName } from '../assets/skeleton'

/** Euler rotation in degrees, intrinsic XYZ order. */
export type EulerDeg = [number, number, number]

export type JointRotations = Partial<Record<BoneName, EulerDeg>>

export const POSTURES = ['lyingBack', 'lyingFront', 'sitting', 'reclining', 'standing'] as const
export type Posture = (typeof POSTURES)[number]

export interface PoseVariant {
  id: string
  /** Overrides merged over the family's base joints. */
  joints: JointRotations
}

export interface JointAdjustment {
  bone: BoneName
  axis: 0 | 1 | 2
  /** Symmetric jitter range in degrees, kept inside joint limits. */
  range: number
}

export interface PoseFamily {
  id: string
  label: string
  posture: Posture
  /** Whole-body orientation relative to an upright person facing +Z. */
  root: EulerDeg
  joints: JointRotations
  /**
   * Alternate limb placements. The fitter may switch variant to make room
   * for a neighbour (pose accommodation).
   */
  variants: PoseVariant[]
  adjust: JointAdjustment[]
  /** Whether the family normally lies on a towel. */
  towel: boolean
  /** Approximate ground footprint in square metres, used for sizing the beach. */
  footprint: number
}

import type { BoneName } from '../assets/skeleton'

/** Euler rotation in degrees, intrinsic XYZ order. */
export type EulerDeg = [number, number, number]

export type JointRotations = Partial<Record<BoneName, EulerDeg>>

export const POSTURES = ['lyingBack', 'lyingFront', 'lyingSide', 'sitting', 'reclining', 'kneeling', 'standing'] as const
export type Posture = (typeof POSTURES)[number]

export const LIMBS = ['legL', 'legR', 'armL', 'armR'] as const
export type Limb = (typeof LIMBS)[number]

/** Unit-interval parameters of one limb: a named mode plus its continuous controls. */
export interface LimbParams {
  mode: string
  u: number[]
}

/**
 * Latent pose description. Every number is in [0, 1] and is mapped to an
 * archetype's ranges, so poses can be sampled, mutated and compared.
 */
export interface PoseParams {
  posture: Posture
  /** Mirror for asymmetric archetypes (e.g. which side someone lies on). */
  side: 1 | -1
  root: number[]
  spine: number[]
  head: number[]
  ground: number
  limbs: Record<Limb, LimbParams>
}

/** Resolved limb goal in the pose frame (root at the origin, before grounding). */
export interface LimbGoal {
  target: [number, number, number]
  pole: [number, number, number]
  /** End-effector local rotation (hand or foot), degrees. */
  end: EulerDeg
}

/**
 * A pose in solvable form: root and spine angles plus IK goals. Blending two
 * of these and solving again yields anatomically constructed in-betweens.
 */
export interface PoseGoals {
  posture: Posture
  root: EulerDeg
  axial: JointRotations
  limbs: Record<Limb, LimbGoal>
  /** Bones expected to rest on the ground. */
  supports: BoneName[]
  /** Groups of which at least one bone rests on the ground. */
  restOn: BoneName[][]
}

export interface PoseResult {
  root: EulerDeg
  joints: JointRotations
  goals: PoseGoals
  /** Empty when the pose passes joint-limit, support and self-collision checks. */
  problems: string[]
}

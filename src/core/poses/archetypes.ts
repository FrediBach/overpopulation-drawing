import type { BoneName } from '../assets/skeleton'
import type { Posture } from './types'

export type Range = [number, number]

export interface Archetype {
  posture: Posture
  label: string
  /** Root pitch about X (degrees): 0 upright, -90 on the back, +90 on the front. */
  pitch: Range
  /** Roll about the spine axis (degrees); mirrored by PoseParams.side. */
  roll: Range
  /** Total spine flexion, twist and side bend (degrees). */
  spine: [Range, Range, Range]
  /** Head pitch, yaw (mirrored by a sampled sign), roll. */
  head: [Range, Range, Range]
  /** How the ground height is found: lowest trunk point, buttocks, feet reach or knees. */
  ground: { kind: 'trunk' | 'pelvis' | 'feet' | 'knees'; range: Range }
  /**
   * Groups of bones of which at least one must rest on the sand (in addition to
   * mode supports). For lying postures the first two groups (hips, shoulders)
   * are also used to settle the body so both touch.
   */
  restOn: BoneName[][]
  legs: Record<string, number>
  arms: Record<string, number>
  /** Coupled leg choices take precedence over independent picks when present. */
  legPairs?: { l: string; r: string; w: number }[]
  /** Probability the right limb mirrors the left one (mode and parameters, with noise). */
  mirror: { legs: number; arms: number }
  /** Approximate ground footprint in square metres, used for sizing the beach. */
  footprint: number
  towel: boolean
}

/**
 * Posture archetypes: continuous ranges plus weighted limb modes. Each
 * archetype spans an unbounded family of poses rather than a fixed list.
 */
export const ARCHETYPES: Record<Posture, Archetype> = {
  lyingBack: {
    posture: 'lyingBack', label: 'Lying on back',
    pitch: [-92, -86], roll: [-8, 8],
    spine: [[-6, 6], [-10, 10], [-8, 8]], head: [[-10, 25], [0, 55], [-10, 10]],
    ground: { kind: 'trunk', range: [0, 0] }, restOn: [['pelvis', 'thigh.L', 'thigh.R'], ['chest', 'head']],
    legs: { straight: 5, kneeUp: 3, kneeOut: 1 },
    arms: { side: 5, belly: 2, behindHead: 2, overhead: 1.5, holdFront: 1, chest: 1, reachOut: 1 },
    mirror: { legs: 0.4, arms: 0.45 },
    footprint: 0.95, towel: true,
  },
  lyingFront: {
    posture: 'lyingFront', label: 'Lying on stomach',
    pitch: [86, 92], roll: [-8, 8],
    spine: [[-8, 2], [-8, 8], [-6, 6]], head: [[-25, 0], [55, 85], [-10, 10]],
    ground: { kind: 'trunk', range: [0, 0] }, restOn: [['pelvis', 'thigh.L', 'thigh.R'], ['chest']],
    legs: { straight: 5, shinUp: 2 },
    arms: { pillow: 5, side: 3, overhead: 1.5, reachOut: 1 },
    mirror: { legs: 0.5, arms: 0.55 },
    footprint: 0.95, towel: true,
  },
  lyingSide: {
    posture: 'lyingSide', label: 'Lying on side',
    pitch: [-92, -86], roll: [72, 98],
    spine: [[0, 18], [-8, 8], [-6, 6]], head: [[0, 20], [0, 20], [-15, 15]],
    ground: { kind: 'trunk', range: [0, 0] }, restOn: [['pelvis', 'thigh.L', 'thigh.R'], ['chest', 'upperArm.L', 'upperArm.R']],
    legs: { sideBent: 4, straight: 2 },
    arms: { reachOut: 3, overhead: 2, side: 2, belly: 2, holdFront: 1.5 },
    mirror: { legs: 0.3, arms: 0.1 },
    footprint: 0.75, towel: true,
  },
  sitting: {
    posture: 'sitting', label: 'Sitting',
    pitch: [-30, 2], roll: [-4, 4],
    spine: [[2, 30], [-14, 14], [-6, 6]], head: [[-10, 25], [0, 45], [-8, 8]],
    ground: { kind: 'pelvis', range: [0, 0] }, restOn: [['pelvis']],
    legs: { sitKneesUp: 4, sitExtended: 2, crossLeg: 0 },
    arms: { propBehind: 4, lap: 3, hugKnees: 2, holdFront: 1.5, belly: 1, reachOut: 1 },
    legPairs: [
      { l: 'sitKneesUp', r: 'sitKneesUp', w: 4 },
      { l: 'sitExtended', r: 'sitExtended', w: 2 },
      { l: 'sitKneesUp', r: 'sitExtended', w: 1.5 },
      { l: 'sitExtended', r: 'sitKneesUp', w: 1.5 },
      { l: 'crossLeg', r: 'crossLeg', w: 3 },
    ],
    mirror: { legs: 0.45, arms: 0.5 },
    footprint: 0.55, towel: true,
  },
  reclining: {
    posture: 'reclining', label: 'Reclining on elbows',
    pitch: [-66, -50], roll: [-4, 4],
    spine: [[-4, 10], [-10, 10], [-6, 6]], head: [[15, 45], [0, 35], [-8, 8]],
    ground: { kind: 'pelvis', range: [0, 0] }, restOn: [['pelvis']],
    legs: { straight: 0, sitExtended: 4, sitKneesUp: 2 },
    arms: { elbowProp: 1 },
    mirror: { legs: 0.4, arms: 0.8 },
    footprint: 0.85, towel: true,
  },
  kneeling: {
    posture: 'kneeling', label: 'Kneeling',
    pitch: [-4, 18], roll: [-4, 4],
    spine: [[0, 25], [-15, 15], [-6, 6]], head: [[-5, 35], [0, 40], [-8, 8]],
    ground: { kind: 'knees', range: [0.78, 0.98] }, restOn: [],
    legs: { kneel: 1 },
    arms: { lap: 2, reachOut: 3, holdFront: 2, side: 1.5 },
    mirror: { legs: 0.6, arms: 0.3 },
    footprint: 0.45, towel: false,
  },
  standing: {
    posture: 'standing', label: 'Standing',
    pitch: [-3, 5], roll: [-3, 3],
    spine: [[-4, 10], [-15, 15], [-5, 5]], head: [[-15, 15], [0, 50], [-6, 6]],
    ground: { kind: 'feet', range: [0.955, 0.995] }, restOn: [],
    legs: { stand: 4, standStep: 1.5 },
    arms: { side: 5, hip: 2, holdFront: 1.5, shadeEyes: 0.7, behindBack: 1, chest: 1 },
    mirror: { legs: 0.5, arms: 0.4 },
    footprint: 0.25, towel: false,
  },
}

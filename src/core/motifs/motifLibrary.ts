import type { Limb, Posture } from '../poses/types'

/**
 * Authored interaction motifs (plan §6): small groups that store relative
 * placements and limb intentions, not frozen poses. Each member's pose is
 * generated fresh, so a motif yields a different arrangement every time.
 * Offsets are metres in the motif frame (+Z forward), yaw in degrees.
 */
export interface MotifMember {
  posture: Posture
  /** Preferred limb modes, e.g. { legL: 'kneeUp' }. */
  hints?: Partial<Record<Limb, string>>
  dx: number
  dz: number
  yaw: number
  child?: boolean
  towel?: boolean
}

export interface Motif {
  id: string
  label: string
  members: MotifMember[]
  /** Pairs of member indices expected to touch or nearly touch. */
  desiredContacts: [number, number][]
  /** How far each member may drift from its authored offset while fitting. */
  maxDrift: number
}

const ring = (radius: number, n: number, posture: Posture, hints?: MotifMember['hints']): MotifMember[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n
    return { posture, hints, dx: Math.sin(a) * radius, dz: Math.cos(a) * radius, yaw: (a * 180) / Math.PI + 180 }
  })

export const MOTIFS: readonly Motif[] = [
  {
    id: 'offset-reclining-pair',
    label: 'Offset reclining pair',
    members: [
      { posture: 'reclining', dx: -0.3, dz: 0, yaw: 0, towel: true },
      { posture: 'reclining', hints: { legL: 'sitKneesUp' }, dx: 0.32, dz: 0.3, yaw: 4, towel: true },
    ],
    desiredContacts: [[0, 1]],
    maxDrift: 0.35,
  },
  {
    id: 'seated-and-lying',
    label: 'Seated and lying pair',
    members: [
      { posture: 'sitting', hints: { armL: 'hugKnees', armR: 'hugKnees' }, dx: 0, dz: 0, yaw: 0 },
      { posture: 'lyingBack', hints: { legL: 'kneeUp' }, dx: 0.62, dz: -0.15, yaw: 95, towel: true },
    ],
    desiredContacts: [[0, 1]],
    maxDrift: 0.35,
  },
  {
    id: 'three-towels',
    label: 'Three adjacent towels',
    members: [
      { posture: 'lyingBack', dx: -0.58, dz: 0, yaw: 0, towel: true },
      { posture: 'lyingFront', dx: 0, dz: 0.22, yaw: 180, towel: true },
      { posture: 'lyingBack', dx: 0.6, dz: -0.18, yaw: 0, towel: true },
    ],
    desiredContacts: [[0, 1], [1, 2]],
    maxDrift: 0.3,
  },
  {
    id: 'conversation',
    label: 'Conversation group',
    members: ring(0.62, 3, 'sitting'),
    desiredContacts: [[0, 1], [1, 2], [2, 0]],
    maxDrift: 0.3,
  },
  {
    id: 'compressed-route',
    label: 'Standing among seated',
    members: [
      { posture: 'standing', hints: { armL: 'holdFront' }, dx: 0, dz: 0, yaw: 0 },
      { posture: 'standing', dx: 0.42, dz: 0.28, yaw: -25 },
      { posture: 'sitting', dx: -0.55, dz: 0.25, yaw: 20 },
    ],
    desiredContacts: [[0, 1]],
    maxDrift: 0.4,
  },
  {
    id: 'alternating-lying',
    label: 'Alternating lying group',
    members: [
      { posture: 'lyingBack', dx: -0.75, dz: 0, yaw: 0, towel: true },
      { posture: 'lyingFront', dx: -0.25, dz: -0.1, yaw: 180, towel: true },
      { posture: 'lyingSide', dx: 0.25, dz: 0.15, yaw: 0, towel: true },
      { posture: 'lyingFront', hints: { legL: 'shinUp', legR: 'shinUp' }, dx: 0.75, dz: 0, yaw: 180, towel: true },
    ],
    desiredContacts: [[0, 1], [1, 2], [2, 3]],
    maxDrift: 0.3,
  },
  {
    id: 'family',
    label: 'Family with child',
    members: [
      { posture: 'sitting', dx: -0.4, dz: 0, yaw: 10, towel: true },
      { posture: 'sitting', hints: { armL: 'holdFront', armR: 'holdFront' }, dx: 0.4, dz: 0.05, yaw: -10 },
      { posture: 'kneeling', dx: 0, dz: 0.65, yaw: 180, child: true },
    ],
    desiredContacts: [[0, 2], [1, 2]],
    maxDrift: 0.35,
  },
]

export const MOTIF_BY_ID: Record<string, Motif> = Object.fromEntries(MOTIFS.map((m) => [m.id, m]))

export const AVERAGE_MOTIF_SIZE = MOTIFS.reduce((s, m) => s + m.members.length, 0) / MOTIFS.length

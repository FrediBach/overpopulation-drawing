/**
 * Authored interaction motifs (plan §6): small groups that store relative
 * placements and intended relationships, not a frozen group transform.
 * Offsets are metres in the motif frame (+Z forward), yaw in degrees.
 */
export interface MotifMember {
  family: string
  variant: string
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

const conversation = (radius: number, n: number, family: string, variant: string): MotifMember[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n
    return {
      family,
      variant,
      dx: Math.sin(a) * radius,
      dz: Math.cos(a) * radius,
      // face the centre
      yaw: (a * 180) / Math.PI + 180,
    }
  })

export const MOTIFS: readonly Motif[] = [
  {
    id: 'offset-reclining-pair',
    label: 'Offset reclining pair',
    members: [
      { family: 'reclining', variant: 'legs-long', dx: -0.3, dz: 0, yaw: 0, towel: true },
      { family: 'reclining', variant: 'knee-up', dx: 0.32, dz: 0.3, yaw: 4, towel: true },
    ],
    desiredContacts: [[0, 1]],
    maxDrift: 0.35,
  },
  {
    id: 'seated-and-lying',
    label: 'Seated and lying pair',
    members: [
      { family: 'sitting', variant: 'hug-knees', dx: 0, dz: 0, yaw: 0 },
      { family: 'lying-back', variant: 'knee-up', dx: 0.62, dz: -0.15, yaw: 95, towel: true },
    ],
    desiredContacts: [[0, 1]],
    maxDrift: 0.35,
  },
  {
    id: 'three-towels',
    label: 'Three adjacent towels',
    members: [
      { family: 'lying-back', variant: 'flat', dx: -0.58, dz: 0, yaw: 0, towel: true },
      { family: 'lying-front', variant: 'arms-folded', dx: 0, dz: 0.22, yaw: 180, towel: true },
      { family: 'lying-back', variant: 'knee-up', dx: 0.6, dz: -0.18, yaw: 0, towel: true },
    ],
    desiredContacts: [[0, 1], [1, 2]],
    maxDrift: 0.3,
  },
  {
    id: 'conversation',
    label: 'Conversation group',
    members: conversation(0.62, 3, 'cross-legged', 'hands-lap'),
    desiredContacts: [[0, 1], [1, 2], [2, 0]],
    maxDrift: 0.3,
  },
  {
    id: 'compressed-route',
    label: 'Standing among seated',
    members: [
      { family: 'standing', variant: 'carrying', dx: 0, dz: 0, yaw: 0 },
      { family: 'standing', variant: 'relaxed', dx: 0.42, dz: 0.28, yaw: -25 },
      { family: 'sitting', variant: 'props-behind', dx: -0.55, dz: 0.25, yaw: 20 },
    ],
    desiredContacts: [[0, 1]],
    maxDrift: 0.4,
  },
  {
    id: 'alternating-reclining',
    label: 'Alternating lying group',
    members: [
      { family: 'lying-back', variant: 'flat', dx: -0.75, dz: 0, yaw: 0, towel: true },
      { family: 'lying-front', variant: 'reading', dx: -0.25, dz: -0.1, yaw: 180, towel: true },
      { family: 'lying-back', variant: 'arms-up', dx: 0.25, dz: 0.15, yaw: 0, towel: true },
      { family: 'lying-front', variant: 'shin-up', dx: 0.75, dz: 0, yaw: 180, towel: true },
    ],
    desiredContacts: [[0, 1], [1, 2], [2, 3]],
    maxDrift: 0.3,
  },
  {
    id: 'family',
    label: 'Family with child',
    members: [
      { family: 'sitting', variant: 'props-behind', dx: -0.4, dz: 0, yaw: 10, towel: true },
      { family: 'cross-legged', variant: 'phone', dx: 0.4, dz: 0.05, yaw: -10 },
      { family: 'sitting', variant: 'leg-out', dx: 0, dz: 0.65, yaw: 180, child: true },
    ],
    desiredContacts: [[0, 2], [1, 2]],
    maxDrift: 0.35,
  },
]

export const MOTIF_BY_ID: Record<string, Motif> = Object.fromEntries(MOTIFS.map((m) => [m.id, m]))

export const AVERAGE_MOTIF_SIZE = MOTIFS.reduce((s, m) => s + m.members.length, 0) / MOTIFS.length

import { mirrorBone, type BoneName } from '../assets/skeleton'
import type { EulerDeg, JointRotations, PoseFamily, Posture } from './types'

/** Mirror a left-side rotation to the right side (reflection through the YZ plane). */
export function mirrorEuler([x, y, z]: EulerDeg): EulerDeg {
  // `+ 0` normalises -0 so saved snapshots round-trip exactly through JSON.
  return [x + 0, -y + 0, -z + 0]
}

/** Author a left-side joint and its mirrored right counterpart. */
function both(bone: string, rot: EulerDeg): JointRotations {
  const left = `${bone}.L` as BoneName
  return { [left]: rot, [mirrorBone(left)]: mirrorEuler(rot) }
}

function merge(...parts: JointRotations[]): JointRotations {
  return Object.assign({}, ...parts)
}

/**
 * Initial pose library: one family per posture plus a few alternates.
 * Conventions: negative X on thigh / upper arm = flexion (forward);
 * positive X on shin = knee flexion; negative X on forearm = elbow flexion;
 * positive Z on a left limb = abduction.
 */
export const POSE_FAMILIES: readonly PoseFamily[] = [
  {
    id: 'lying-back',
    label: 'Lying on back',
    posture: 'lyingBack',
    root: [-90, 0, 0],
    joints: merge(both('upperArm', [0, 0, 12]), both('foreArm', [-8, 0, 0]), both('thigh', [-2, 0, 4]), both('foot', [-35, 0, 0])),
    variants: [
      { id: 'flat', joints: {} },
      { id: 'knee-up', joints: { 'thigh.L': [-55, 0, 6], 'shin.L': [100, 0, 0], 'foot.L': [0, 0, 0] } },
      { id: 'both-knees', joints: merge(both('thigh', [-60, 0, 5]), both('shin', [110, 0, 0]), both('foot', [5, 0, 0])) },
      { id: 'arms-up', joints: merge(both('upperArm', [-165, 0, 22]), both('foreArm', [-40, 0, 0])) },
      { id: 'arm-in', joints: { 'upperArm.L': [-10, 0, 2], 'foreArm.L': [-110, 0, 0] } },
    ],
    adjust: [
      { bone: 'upperArm.L', axis: 2, range: 8 },
      { bone: 'upperArm.R', axis: 2, range: 8 },
      { bone: 'thigh.L', axis: 2, range: 4 },
      { bone: 'thigh.R', axis: 2, range: 4 },
      { bone: 'head', axis: 1, range: 35 },
    ],
    towel: true,
    footprint: 0.95,
  },
  {
    id: 'lying-front',
    label: 'Lying on stomach',
    posture: 'lyingFront',
    root: [90, 0, 0],
    joints: merge(
      both('upperArm', [-150, 0, 45]),
      both('foreArm', [-115, 0, 0]),
      both('thigh', [2, 0, 5]),
      both('foot', [55, 0, 0]),
      { head: [-20, 70, 0], neck: [-10, 15, 0] },
    ),
    variants: [
      { id: 'arms-folded', joints: {} },
      { id: 'arms-side', joints: merge(both('upperArm', [0, 0, 10]), both('foreArm', [0, 0, 0])) },
      { id: 'shin-up', joints: { 'shin.L': [80, 0, 0] } },
      { id: 'reading', joints: merge(both('upperArm', [-120, 0, 15]), both('foreArm', [-30, 0, 0]), { head: [-40, 0, 0], neck: [-25, 0, 0], chest: [-12, 0, 0] }) },
    ],
    adjust: [
      { bone: 'thigh.L', axis: 2, range: 5 },
      { bone: 'thigh.R', axis: 2, range: 5 },
      { bone: 'shin.R', axis: 0, range: 15 },
    ],
    towel: true,
    footprint: 0.95,
  },
  {
    id: 'sitting',
    label: 'Sitting, knees up',
    posture: 'sitting',
    root: [-15, 0, 0],
    joints: merge(
      both('thigh', [-100, 0, 8]),
      both('shin', [100, 0, 0]),
      both('foot', [-5, 0, 0]),
      both('upperArm', [45, 0, 16]),
      both('foreArm', [0, 0, 0]),
      { chest: [8, 0, 0], neck: [10, 0, 0], head: [10, 0, 0] },
    ),
    variants: [
      { id: 'props-behind', joints: {} },
      { id: 'hug-knees', joints: merge(both('upperArm', [-55, 0, 8]), both('foreArm', [-55, 0, 0]), { chest: [20, 0, 0], spine: [12, 0, 0], neck: [-10, 0, 0], head: [-5, 0, 0] }) },
      { id: 'leg-out', joints: { 'thigh.L': [-75, 0, 10], 'shin.L': [10, 0, 0], 'foot.L': [-20, 0, 0] } },
    ],
    adjust: [
      { bone: 'thigh.L', axis: 2, range: 6 },
      { bone: 'thigh.R', axis: 2, range: 6 },
      { bone: 'head', axis: 1, range: 40 },
    ],
    towel: true,
    footprint: 0.5,
  },
  {
    id: 'cross-legged',
    label: 'Sitting cross-legged',
    posture: 'sitting',
    root: [-4, 0, 0],
    joints: merge(
      both('thigh', [-85, 0, 50]),
      both('shin', [140, 0, 0]),
      both('foot', [-20, 0, 0]),
      both('upperArm', [-20, 0, 12]),
      both('foreArm', [-55, 0, 0]),
      { chest: [5, 0, 0], head: [8, 0, 0] },
    ),
    variants: [
      { id: 'hands-lap', joints: {} },
      { id: 'phone', joints: merge(both('upperArm', [-25, 0, 6]), both('foreArm', [-95, 0, 0]), { head: [30, 0, 0], neck: [15, 0, 0] }) },
    ],
    adjust: [{ bone: 'head', axis: 1, range: 40 }],
    towel: true,
    footprint: 0.55,
  },
  {
    id: 'reclining',
    label: 'Reclining on elbows',
    posture: 'reclining',
    root: [-62, 0, 0],
    joints: merge(
      both('thigh', [-28, 0, 4]),
      both('foot', [-30, 0, 0]),
      both('upperArm', [70, 0, 12]),
      both('foreArm', [-100, 0, 0]),
      { neck: [35, 0, 0], head: [20, 0, 0] },
    ),
    variants: [
      { id: 'legs-long', joints: {} },
      { id: 'knee-up', joints: { 'thigh.L': [-85, 0, 6], 'shin.L': [110, 0, 0], 'foot.L': [0, 0, 0] } },
      { id: 'crossed-ankles', joints: { 'thigh.L': [-30, 0, -4], 'thigh.R': [-28, 0, 3] } },
    ],
    adjust: [
      { bone: 'thigh.L', axis: 2, range: 5 },
      { bone: 'thigh.R', axis: 2, range: 5 },
      { bone: 'head', axis: 1, range: 30 },
    ],
    towel: true,
    footprint: 0.85,
  },
  {
    id: 'standing',
    label: 'Standing',
    posture: 'standing',
    root: [0, 0, 0],
    joints: merge(both('upperArm', [0, 0, 7]), both('foreArm', [-12, 0, 0]), both('thigh', [0, 0, 3]), both('foot', [0, 0, 0])),
    variants: [
      { id: 'relaxed', joints: {} },
      { id: 'weight-shift', joints: { 'thigh.L': [-12, 0, 8], 'shin.L': [20, 0, 0], 'foot.L': [-8, 0, 0], pelvis: [0, 0, -3] } },
      { id: 'shading-eyes', joints: { 'upperArm.R': [-140, 0, -15], 'foreArm.R': [-75, 0, 0] } },
      { id: 'carrying', joints: { 'upperArm.L': [-30, 0, 5], 'foreArm.L': [-85, 0, 0] } },
    ],
    adjust: [
      { bone: 'upperArm.L', axis: 0, range: 10 },
      { bone: 'upperArm.R', axis: 0, range: 10 },
      { bone: 'head', axis: 1, range: 45 },
    ],
    towel: false,
    footprint: 0.25,
  },
]

export const POSE_FAMILY_BY_ID: Record<string, PoseFamily> = Object.fromEntries(POSE_FAMILIES.map((f) => [f.id, f]))

export function familiesForPosture(posture: Posture): PoseFamily[] {
  return POSE_FAMILIES.filter((f) => f.posture === posture)
}

/** Resolve base + variant joints into a full rotation table. */
export function resolveJoints(family: PoseFamily, variantId: string): JointRotations {
  const variant = family.variants.find((v) => v.id === variantId) ?? family.variants[0]
  return { ...family.joints, ...variant.joints }
}

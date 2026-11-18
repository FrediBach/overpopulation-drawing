/**
 * Canonical skeleton convention (stand-in for the MPFB GameEngine rig).
 *
 * Units are metres. Y is up, +Z is the person's forward, +X is the person's
 * left. Every bone stores its rest offset from the parent joint and the
 * body segment (an elliptical capsule) it carries, in the bone's local frame.
 * Bones are referenced by semantic name, never by index, so a real exported
 * rig can be mapped onto this table later.
 */

export const BONE_NAMES = [
  'pelvis',
  'spine',
  'chest',
  'neck',
  'head',
  'upperArm.L',
  'foreArm.L',
  'hand.L',
  'upperArm.R',
  'foreArm.R',
  'hand.R',
  'thigh.L',
  'shin.L',
  'foot.L',
  'thigh.R',
  'shin.R',
  'foot.R',
] as const

export type BoneName = (typeof BONE_NAMES)[number]

/** Coarse body regions, used by population accounting and diagnostics. */
export type BodyRegion = 'head' | 'torso' | 'arm' | 'leg'

export interface SegmentSpec {
  /** Segment start in bone-local coordinates. */
  a: [number, number, number]
  /** Segment end in bone-local coordinates. */
  b: [number, number, number]
  /** Cross-section half-width along the bone's local X. */
  rx: number
  /** Cross-section half-depth along the bone's local Z. */
  rz: number
  /** Cap radius along the segment axis. Defaults to min(rx, rz). */
  rcap?: number
}

export interface BoneSpec {
  name: BoneName
  parent: BoneName | null
  /** Joint position relative to the parent joint, parent-local frame. */
  offset: [number, number, number]
  segment: SegmentSpec
  region: BodyRegion
}

function mirrorName(name: BoneName): BoneName {
  if (name.endsWith('.L')) return name.replace('.L', '.R') as BoneName
  if (name.endsWith('.R')) return name.replace('.R', '.L') as BoneName
  return name
}

export function mirrorBone(name: BoneName): BoneName {
  return mirrorName(name)
}


function leftAndRight(spec: BoneSpec): BoneSpec[] {
  const right: BoneSpec = {
    ...spec,
    name: mirrorName(spec.name),
    parent: spec.parent ? mirrorName(spec.parent) : null,
    offset: [-spec.offset[0], spec.offset[1], spec.offset[2]],
    segment: {
      ...spec.segment,
      a: [-spec.segment.a[0], spec.segment.a[1], spec.segment.a[2]],
      b: [-spec.segment.b[0], spec.segment.b[1], spec.segment.b[2]],
    },
  }
  return [spec, right]
}

/** Rest skeleton for the reference body (about 1.76 m tall). */
export const REFERENCE_SKELETON: readonly BoneSpec[] = [
  {
    name: 'pelvis', parent: null, offset: [0, 0, 0], region: 'torso',
    segment: { a: [0, -0.01, 0], b: [0, 0.1, 0], rx: 0.155, rz: 0.105, rcap: 0.09 },
  },
  {
    name: 'spine', parent: 'pelvis', offset: [0, 0.12, 0], region: 'torso',
    segment: { a: [0, 0, 0], b: [0, 0.16, 0], rx: 0.14, rz: 0.095, rcap: 0.08 },
  },
  {
    name: 'chest', parent: 'spine', offset: [0, 0.18, 0], region: 'torso',
    segment: { a: [0, 0.03, 0.005], b: [0, 0.2, 0], rx: 0.17, rz: 0.105, rcap: 0.08 },
  },
  {
    name: 'neck', parent: 'chest', offset: [0, 0.27, 0], region: 'head',
    segment: { a: [0, -0.02, 0], b: [0, 0.08, 0.01], rx: 0.05, rz: 0.05 },
  },
  {
    name: 'head', parent: 'neck', offset: [0, 0.09, 0.01], region: 'head',
    segment: { a: [0, 0.07, 0.01], b: [0, 0.14, 0.0], rx: 0.08, rz: 0.095, rcap: 0.09 },
  },
  ...leftAndRight({
    name: 'upperArm.L', parent: 'chest', offset: [0.2, 0.2, 0], region: 'arm',
    segment: { a: [0, 0, 0], b: [0, -0.27, 0], rx: 0.048, rz: 0.048 },
  }),
  ...leftAndRight({
    name: 'foreArm.L', parent: 'upperArm.L', offset: [0, -0.28, 0], region: 'arm',
    segment: { a: [0, 0, 0], b: [0, -0.24, 0], rx: 0.038, rz: 0.036 },
  }),
  ...leftAndRight({
    name: 'hand.L', parent: 'foreArm.L', offset: [0, -0.25, 0], region: 'arm',
    segment: { a: [0, -0.02, 0], b: [0, -0.12, 0], rx: 0.022, rz: 0.042, rcap: 0.025 },
  }),
  ...leftAndRight({
    name: 'thigh.L', parent: 'pelvis', offset: [0.085, -0.01, 0], region: 'leg',
    segment: { a: [0, 0, 0], b: [0, -0.41, 0], rx: 0.072, rz: 0.072 },
  }),
  ...leftAndRight({
    name: 'shin.L', parent: 'thigh.L', offset: [0, -0.42, 0], region: 'leg',
    segment: { a: [0, 0, 0], b: [0, -0.39, 0], rx: 0.05, rz: 0.052 },
  }),
  ...leftAndRight({
    name: 'foot.L', parent: 'shin.L', offset: [0, -0.4, 0], region: 'leg',
    segment: { a: [0, -0.02, -0.02], b: [0, -0.045, 0.16], rx: 0.035, rz: 0.03, rcap: 0.035 },
  }),
]

export const BONE_INDEX: Record<BoneName, number> = Object.fromEntries(
  REFERENCE_SKELETON.map((b, i) => [b.name, i]),
) as Record<BoneName, number>

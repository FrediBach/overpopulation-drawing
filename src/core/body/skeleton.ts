import { REFERENCE_SKELETON, type BoneName, type BoneSpec } from '../assets/skeleton'
import type { JointRotations } from '../poses/types'
import type { BodyParams } from './params'

/** Rest pose used to polygonise and skin bodies: an A-pose keeps limbs apart. */
export const REST_POSE: JointRotations = {
  'upperArm.L': [0, 0, 38],
  'upperArm.R': [0, 0, -38],
  'thigh.L': [0, 0, 5],
  'thigh.R': [0, 0, -5],
}

const LIMB = /^(upperArm|foreArm|hand|thigh|shin|foot)/

/**
 * Proportioned skeleton for a body. Children have relatively shorter limbs
 * and a larger head; femininity narrows shoulders and widens hips.
 */
export function buildSkeleton(p: BodyParams): BoneSpec[] {
  const h = p.height
  const limb = 1 - 0.1 * p.child
  return REFERENCE_SKELETON.map((bone) => {
    let s = h
    if (LIMB.test(bone.name)) s *= limb
    let ox = bone.offset[0] * s
    if (bone.name.startsWith('upperArm')) ox *= 1 + 0.08 * (0.5 - p.femininity) + 0.05 * p.muscle
    if (bone.name.startsWith('thigh')) ox *= 1 + 0.12 * (p.femininity - 0.5) + 0.2 * p.mass
    return {
      ...bone,
      offset: [ox, bone.offset[1] * s, bone.offset[2] * s],
      segment: {
        ...bone.segment,
        a: [bone.segment.a[0] * s, bone.segment.a[1] * s, bone.segment.a[2] * s],
        b: [bone.segment.b[0] * s, bone.segment.b[1] * s, bone.segment.b[2] * s],
      },
    }
  })
}

export function boneLength(skeleton: BoneSpec[], child: BoneName): number {
  const b = skeleton.find((s) => s.name === child)!
  return Math.hypot(...b.offset)
}

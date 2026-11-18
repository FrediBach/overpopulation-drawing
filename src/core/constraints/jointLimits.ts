import { BONE_NAMES, mirrorBone, type BoneName } from '../assets/skeleton'
import type { EulerDeg, JointRotations } from '../poses/types'

/** [min, max] in degrees for each Euler axis. */
export type AxisLimits = [[number, number], [number, number], [number, number]]

/**
 * Conservative anatomical ranges for the left side and spine. Right-side
 * limits are derived by mirroring. These are acceptance constraints, not costs.
 */
const LEFT_AND_CENTRE: Partial<Record<BoneName, AxisLimits>> = {
  pelvis: [[-20, 20], [-20, 20], [-15, 15]],
  spine: [[-30, 40], [-30, 30], [-25, 25]],
  chest: [[-30, 40], [-30, 30], [-25, 25]],
  neck: [[-45, 50], [-50, 50], [-30, 30]],
  head: [[-45, 45], [-80, 80], [-30, 30]],
  'upperArm.L': [[-180, 90], [-95, 95], [-40, 130]],
  'foreArm.L': [[-150, 0], [-80, 80], [-5, 5]],
  'hand.L': [[-70, 70], [-30, 30], [-30, 30]],
  'thigh.L': [[-140, 35], [-60, 60], [-35, 80]],
  'shin.L': [[0, 150], [-10, 10], [-5, 5]],
  'foot.L': [[-50, 60], [-20, 20], [-20, 20]],
}

function mirrorLimits(l: AxisLimits): AxisLimits {
  const m = (r: [number, number]): [number, number] => [-r[1], -r[0]]
  return [l[0], m(l[1]), m(l[2])]
}

export const JOINT_LIMITS: Record<BoneName, AxisLimits> = Object.fromEntries(
  BONE_NAMES.map((name) => {
    const own = LEFT_AND_CENTRE[name]
    if (own) return [name, own]
    const src = LEFT_AND_CENTRE[mirrorBone(name)]
    if (!src) throw new Error(`No joint limits for ${name}`)
    return [name, mirrorLimits(src)]
  }),
) as Record<BoneName, AxisLimits>

export function clampToLimits(bone: BoneName, rot: EulerDeg): EulerDeg {
  const l = JOINT_LIMITS[bone]
  return [0, 1, 2].map((i) => Math.min(l[i][1], Math.max(l[i][0], rot[i])) + 0) as EulerDeg
}

export interface JointLimitViolation {
  bone: BoneName
  axis: number
  value: number
  limit: [number, number]
}

/** Shoulders are validated by a direction cone in the pose generator instead of Euler ranges. */
const CONE_CHECKED = new Set<BoneName>(['upperArm.L', 'upperArm.R'])

export function findJointLimitViolations(joints: JointRotations, toleranceDeg = 0.01): JointLimitViolation[] {
  const out: JointLimitViolation[] = []
  for (const name of BONE_NAMES) {
    const rot = joints[name]
    if (!rot || CONE_CHECKED.has(name)) continue
    const l = JOINT_LIMITS[name]
    for (let axis = 0; axis < 3; axis++) {
      if (rot[axis] < l[axis][0] - toleranceDeg || rot[axis] > l[axis][1] + toleranceDeg) {
        out.push({ bone: name, axis, value: rot[axis], limit: l[axis] })
      }
    }
  }
  return out
}

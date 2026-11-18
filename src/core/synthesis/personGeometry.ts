import { getBodySkeleton } from '../body/asset'
import type { BodyParams } from '../body/params'
import { placeCapsules, placeMatrices, poseBody, type Capsule } from '../poses/fk'
import type { PersonRecord } from '../scene/types'

/** Rebuild a saved person's world-space capsules from its numerical record. */
export function personCapsules(p: PersonRecord, bodies: BodyParams[]): Capsule[] {
  return placeCapsules(poseBody(getBodySkeleton(bodies[p.bodyIndex]), p.root, p.joints), p)
}

/** World bone matrices for skinning a saved person. */
export function personMatrices(p: PersonRecord, bodies: BodyParams[]): Float64Array {
  return placeMatrices(poseBody(getBodySkeleton(bodies[p.bodyIndex]), p.root, p.joints), p)
}

import { BODY_VARIANT_BY_ID } from '../assets/bodyVariants'
import { POSE_FAMILY_BY_ID } from '../poses/poseLibrary'
import { placeCapsules, poseBody, type Capsule } from '../poses/fk'
import type { PersonRecord } from '../scene/types'

/** Rebuild a saved person's world-space capsules from its numerical record. */
export function personCapsules(p: PersonRecord): Capsule[] {
  const variant = BODY_VARIANT_BY_ID[p.bodyVariant]
  const family = POSE_FAMILY_BY_ID[p.family]
  if (!variant) throw new Error(`Unknown body variant ${p.bodyVariant}`)
  if (!family) throw new Error(`Unknown pose family ${p.family}`)
  return placeCapsules(poseBody(variant, family.root, p.joints), p)
}

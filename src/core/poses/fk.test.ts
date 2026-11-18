import { BODY_VARIANTS, BODY_VARIANT_BY_ID } from '../assets/bodyVariants'
import { findJointLimitViolations } from '../constraints/jointLimits'
import { placeCapsules, poseBody } from './fk'
import { POSE_FAMILIES, POSE_FAMILY_BY_ID, resolveJoints } from './poseLibrary'

const lowestPoint = (body: ReturnType<typeof poseBody>) =>
  Math.min(
    ...body.capsules.map((c) => {
      const sup = Math.sqrt((c.rx * c.ax[1]) ** 2 + (c.rcap * c.ay[1]) ** 2 + (c.rz * c.az[1]) ** 2)
      return Math.min(c.a[1], c.b[1]) - sup
    }),
  )

describe('poseBody', () => {
  it('produces a plausibly tall standing reference body', () => {
    const fam = POSE_FAMILY_BY_ID.standing
    const body = poseBody(BODY_VARIANT_BY_ID['avg-a'], fam.root, resolveJoints(fam, 'relaxed'))
    expect(body.height).toBeGreaterThan(1.65)
    expect(body.height).toBeLessThan(1.85)
  })

  it('makes lying bodies low and long', () => {
    const fam = POSE_FAMILY_BY_ID['lying-back']
    const body = poseBody(BODY_VARIANT_BY_ID['avg-a'], fam.root, resolveJoints(fam, 'flat'))
    expect(body.height).toBeLessThan(0.4)
    expect(body.reach).toBeGreaterThan(0.75)
  })

  it.each(POSE_FAMILIES.flatMap((f) => f.variants.map((v) => [f.id, v.id] as const)))('%s/%s is grounded and within joint limits', (familyId, variantId) => {
    const fam = POSE_FAMILY_BY_ID[familyId]
    const joints = resolveJoints(fam, variantId)
    expect(findJointLimitViolations(joints)).toEqual([])
    for (const variant of BODY_VARIANTS) {
      const body = poseBody(variant, fam.root, joints)
      expect(lowestPoint(body)).toBeCloseTo(0, 6)
    }
  })

  it('mirrors left and right limbs in a symmetric pose', () => {
    const fam = POSE_FAMILY_BY_ID.standing
    const body = poseBody(BODY_VARIANT_BY_ID['avg-a'], fam.root, resolveJoints(fam, 'relaxed'))
    const l = body.capsules.find((c) => c.bone === 'shin.L')!
    const r = body.capsules.find((c) => c.bone === 'shin.R')!
    expect(l.b[0]).toBeCloseTo(-r.b[0], 6)
    expect(l.b[1]).toBeCloseTo(r.b[1], 6)
    // +X is the person's left.
    expect(l.b[0]).toBeGreaterThan(0)
  })

  it('places capsules with yaw about +Y', () => {
    const fam = POSE_FAMILY_BY_ID.standing
    const body = poseBody(BODY_VARIANT_BY_ID['avg-a'], fam.root, resolveJoints(fam, 'relaxed'))
    const placed = placeCapsules(body, { x: 10, z: -5, yaw: Math.PI })
    const foot = body.capsules.find((c) => c.bone === 'foot.L')!
    const footPlaced = placed.find((c) => c.bone === 'foot.L')!
    expect(footPlaced.b[0]).toBeCloseTo(10 - foot.b[0], 6)
    expect(footPlaced.b[2]).toBeCloseTo(-5 - foot.b[2], 6)
    expect(footPlaced.b[1]).toBeCloseTo(foot.b[1], 6)
  })
})
